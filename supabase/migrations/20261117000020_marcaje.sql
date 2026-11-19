-- Sprint 2, fase 4: marcaje desde la PWA del trabajador y desde el kiosco.

-- ---------------------------------------------------------------- geocerca y foto

alter table jornada.evento
  add column fuera_de_geocerca boolean;

comment on column jornada.evento.fuera_de_geocerca is 'true si el marcaje se hizo fuera de la geocerca del centro; null si no hay ubicación o el centro no tiene geocerca. Nunca bloquea el marcaje.';

-- Distancia en metros entre dos puntos (haversine).
create function jornada.distancia_m(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
    + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
      * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2)
  ));
$$;

-- Antes de insertar: anota si el marcaje quedó fuera de la geocerca y fija la ruta
-- de la foto en el bucket (tenant/trabajador/aaaa-mm/evento.jpg).
create function jornada.completar_marcaje()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centro record;
begin
  if new.lat is not null and new.lng is not null then
    select c.lat, c.lng, c.radio_m
    into v_centro
    from tenants.trabajador t
    join tenants.centro_trabajo c on c.id = t.centro_id
    where t.id = new.trabajador_id;

    if v_centro.lat is not null and v_centro.lng is not null and v_centro.radio_m is not null then
      -- Se da el beneficio de la imprecisión del GPS.
      new.fuera_de_geocerca :=
        jornada.distancia_m(new.lat, new.lng, v_centro.lat, v_centro.lng)
        > v_centro.radio_m + coalesce(new.precision_m, 0);
    end if;
  end if;

  if new.foto_hash is not null then
    new.foto_url := new.tenant_id::text || '/' || new.trabajador_id::text || '/'
      || to_char(now() at time zone 'UTC', 'YYYY-MM') || '/' || new.id::text || '.jpg';
  else
    new.foto_url := null;
  end if;

  return new;
end;
$$;

create trigger evento_completa_marcaje
  before insert on jornada.evento
  for each row execute function jornada.completar_marcaje();

-- ---------------------------------------------------------------- fotos de marcaje

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcajes', 'marcajes', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- El trabajador sube la foto de su propio marcaje; la leen él y los administradores.
create policy marcajes_subida on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marcajes'
    and (storage.foldername(name))[1] = tenants.jwt_tenant_id()::text
    and (storage.foldername(name))[2] = tenants.jwt_trabajador_id()::text
  );

create policy marcajes_lectura on storage.objects for select to authenticated
  using (
    bucket_id = 'marcajes'
    and (
      tenants.es_admin_de(((storage.foldername(name))[1])::uuid)
      or (
        (storage.foldername(name))[1] = tenants.jwt_tenant_id()::text
        and (storage.foldername(name))[2] = tenants.jwt_trabajador_id()::text
      )
    )
  );

-- ---------------------------------------------------------------- invitaciones

-- Enlace personal para que un trabajador active su acceso a la PWA.
create table tenants.invitacion (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  trabajador_id uuid not null,
  token_hash text not null unique,
  creado_por uuid references tenants.usuario (id),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '7 days'),
  usada_en timestamptz,
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id)
);

comment on table tenants.invitacion is 'Invitación de un solo uso para que un trabajador active su acceso a la PWA.';

alter table tenants.invitacion enable row level security;
grant select, insert, update, delete on tenants.invitacion to service_role;
grant select (id, tenant_id, trabajador_id, creado_en, expira_en, usada_en) on tenants.invitacion to authenticated;

create policy invitacion_lectura on tenants.invitacion for select to authenticated
  using (tenants.es_admin_de(tenant_id));

create function tenants.crear_invitacion(trabajador_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_token text := tenants.generar_token(24);
begin
  select t.tenant_id into v_tenant_id from tenants.trabajador t where t.id = crear_invitacion.trabajador_id;
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'El trabajador no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into tenants.invitacion (tenant_id, trabajador_id, token_hash, creado_por)
  values (v_tenant_id, crear_invitacion.trabajador_id, tenants.hash_token(v_token), tenants.jwt_usuario_id());
  return v_token;
end;
$$;

revoke all on function tenants.crear_invitacion(uuid) from public;
grant execute on function tenants.crear_invitacion(uuid) to authenticated;

-- Lo mínimo para saludar a quien abre el enlace: su nombre de pila y la empresa.
create function tenants.invitacion_info(p_token text)
returns table (nombre text, empresa text)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(t.nombre, ' ', 1), e.razon_social
  from tenants.invitacion i
  join tenants.trabajador t on t.id = i.trabajador_id
  join tenants.empresa e on e.id = i.tenant_id
  where i.token_hash = tenants.hash_token(p_token)
    and i.usada_en is null
    and i.expira_en > now();
$$;

revoke all on function tenants.invitacion_info(text) from public;
grant execute on function tenants.invitacion_info(text) to anon, authenticated, service_role;

-- Intentos fallidos de PIN por trabajador: tras 5 seguidos se bloquea 15 minutos.
create table tenants.intento_pin (
  trabajador_id uuid primary key references tenants.trabajador (id),
  fallidos integer not null default 0,
  bloqueado_hasta timestamptz
);

alter table tenants.intento_pin enable row level security;
grant select, insert, update, delete on tenants.intento_pin to service_role;

-- Comprueba el PIN de un trabajador llevando la cuenta de intentos. Solo el servidor.
create function tenants.verificar_pin(p_trabajador_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_bloqueado timestamptz;
  v_ok boolean;
begin
  select t.pin_hash into v_hash from tenants.trabajador t where t.id = p_trabajador_id and t.fecha_baja is null;
  if v_hash is null then
    return false;
  end if;

  select i.bloqueado_hasta into v_bloqueado from tenants.intento_pin i where i.trabajador_id = p_trabajador_id;
  if v_bloqueado is not null and v_bloqueado > now() then
    raise exception 'Demasiados intentos. Espera 15 minutos o pide un PIN nuevo.' using errcode = 'insufficient_privilege';
  end if;

  v_ok := v_hash = extensions.crypt(p_pin, v_hash);
  if v_ok then
    delete from tenants.intento_pin i where i.trabajador_id = p_trabajador_id;
  else
    insert into tenants.intento_pin as i (trabajador_id, fallidos)
    values (p_trabajador_id, 1)
    on conflict (trabajador_id) do update
    set fallidos = case when i.bloqueado_hasta is not null then 1 else i.fallidos + 1 end,
        bloqueado_hasta = case
          when i.bloqueado_hasta is null and i.fallidos + 1 >= 5 then now() + interval '15 minutes'
        end;
  end if;
  return v_ok;
end;
$$;

revoke all on function tenants.verificar_pin(uuid, text) from public;
grant execute on function tenants.verificar_pin(uuid, text) to service_role;

-- Canjea la invitación: comprueba el PIN y liga la cuenta de Auth al trabajador
-- con rol empleado. La llama el servidor después de crear la cuenta.
create function tenants.aceptar_invitacion(p_token text, p_pin text, p_auth_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitacion tenants.invitacion;
  v_usuario_id uuid;
begin
  select i.* into v_invitacion
  from tenants.invitacion i
  where i.token_hash = tenants.hash_token(p_token) and i.usada_en is null and i.expira_en > now()
  for update;
  if v_invitacion.id is null then
    raise exception 'La invitación ya se usó o venció. Pide una nueva.' using errcode = 'no_data_found';
  end if;

  if not tenants.verificar_pin(v_invitacion.trabajador_id, p_pin) then
    raise exception 'El PIN no coincide.' using errcode = 'invalid_password';
  end if;

  if exists (
    select 1 from tenants.usuario u where u.trabajador_id = v_invitacion.trabajador_id and u.activo
  ) then
    raise exception 'Este trabajador ya tiene acceso. Entra con tu correo y tu PIN.' using errcode = 'unique_violation';
  end if;

  insert into tenants.usuario (tenant_id, auth_user_id, rol, trabajador_id)
  values (v_invitacion.tenant_id, p_auth_user_id, 'empleado', v_invitacion.trabajador_id)
  returning id into v_usuario_id;

  update tenants.invitacion i set usada_en = now() where i.id = v_invitacion.id;
  return v_usuario_id;
end;
$$;

revoke all on function tenants.aceptar_invitacion(text, text, uuid) from public;
grant execute on function tenants.aceptar_invitacion(text, text, uuid) to service_role;

-- Entrada con correo + PIN: comprueba el PIN del empleado ligado a esa cuenta.
create function tenants.verificar_pin_de_cuenta(p_auth_user_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajador_id uuid;
begin
  select u.trabajador_id into v_trabajador_id
  from tenants.usuario u
  where u.auth_user_id = p_auth_user_id and u.rol = 'empleado' and u.activo
  limit 1;
  if v_trabajador_id is null then
    return false;
  end if;
  return tenants.verificar_pin(v_trabajador_id, p_pin);
end;
$$;

revoke all on function tenants.verificar_pin_de_cuenta(uuid, text) from public;
grant execute on function tenants.verificar_pin_de_cuenta(uuid, text) to service_role;

-- ---------------------------------------------------------------- kiosco

alter table tenants.centro_trabajo
  add column pin_admin_hash text;

comment on column tenants.centro_trabajo.pin_admin_hash is 'Hash del PIN de administrador del kiosco: se pide para desvincular la tablet.';

-- Genera (o reemplaza) el PIN de administrador del kiosco del centro y lo devuelve una vez.
create function tenants.generar_pin_admin(centro_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_pin text := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
begin
  select c.tenant_id into v_tenant_id from tenants.centro_trabajo c where c.id = generar_pin_admin.centro_id;
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'El centro de trabajo no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  update tenants.centro_trabajo c
  set pin_admin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 8))
  where c.id = generar_pin_admin.centro_id;
  return v_pin;
end;
$$;

revoke all on function tenants.generar_pin_admin(uuid) from public;
grant execute on function tenants.generar_pin_admin(uuid) to authenticated;

-- Dispositivo vigente a partir de su token; actualiza su último uso.
create function tenants.dispositivo_por_token(p_token text)
returns tenants.dispositivo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo;
begin
  update tenants.dispositivo d
  set ultimo_uso = now()
  where d.token_hash = tenants.hash_token(p_token) and d.revocado_en is null
  returning d.* into v_dispositivo;
  if v_dispositivo.id is null then
    raise exception 'Este kiosco no está vinculado o fue desvinculado.' using errcode = 'insufficient_privilege';
  end if;
  return v_dispositivo;
end;
$$;

revoke all on function tenants.dispositivo_por_token(text) from public;

-- Canjea el código de enlace de 8 caracteres por un token de dispositivo de larga vida.
create function tenants.vincular_dispositivo(p_codigo text)
returns table (token text, centro text, empresa text, zona_horaria text, foto boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo;
  v_token text := tenants.generar_token(32);
begin
  select d.* into v_dispositivo
  from tenants.dispositivo d
  where d.codigo_enlace_hash = tenants.hash_token(upper(btrim(p_codigo)))
    and d.codigo_expira_en > now()
    and d.token_hash is null
    and d.revocado_en is null
  for update;
  if v_dispositivo.id is null then
    raise exception 'El código no es válido, ya se usó o venció.' using errcode = 'no_data_found';
  end if;

  update tenants.dispositivo d
  set token_hash = tenants.hash_token(v_token),
      codigo_enlace_hash = null,
      codigo_expira_en = null,
      vinculado_en = now(),
      ultimo_uso = now()
  where d.id = v_dispositivo.id;

  return query
  select v_token, c.nombre, e.razon_social, c.zona_horaria, c.foto_en_kiosco
  from tenants.centro_trabajo c
  join tenants.empresa e on e.id = c.tenant_id
  where c.id = v_dispositivo.centro_id;
end;
$$;

-- Configuración vigente del kiosco (por si el dueño cambia la foto o el nombre).
create function tenants.kiosco_estado(p_token text)
returns table (centro text, empresa text, zona_horaria text, foto boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo := tenants.dispositivo_por_token(p_token);
begin
  return query
  select c.nombre, e.razon_social, c.zona_horaria, c.foto_en_kiosco
  from tenants.centro_trabajo c
  join tenants.empresa e on e.id = c.tenant_id
  where c.id = v_dispositivo.centro_id;
end;
$$;

-- Desvincula la tablet. Pide el PIN de administrador del kiosco del centro.
create function tenants.desvincular_dispositivo(p_token text, p_pin_admin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo := tenants.dispositivo_por_token(p_token);
  v_hash text;
begin
  select c.pin_admin_hash into v_hash from tenants.centro_trabajo c where c.id = v_dispositivo.centro_id;
  if v_hash is null or v_hash <> extensions.crypt(p_pin_admin, v_hash) then
    raise exception 'El PIN de administrador no coincide.' using errcode = 'invalid_password';
  end if;

  update tenants.dispositivo d set revocado_en = now() where d.id = v_dispositivo.id;
  update tenants.usuario u set activo = false where u.id = v_dispositivo.usuario_id;
  return true;
end;
$$;

-- Marcaje en kiosco: identifica al trabajador del centro por PIN o por QR, decide
-- entrada o salida según su último marcaje del día e inserta el evento.
create function jornada.kiosco_marcar(
  p_token text,
  p_client_event_id uuid,
  p_ts_dispositivo timestamptz,
  p_pin text default null,
  p_qr text default null,
  p_foto_hash text default null
)
returns table (
  evento_id uuid,
  duplicado boolean,
  trabajador_id uuid,
  nombre text,
  tipo text,
  ts_servidor timestamptz,
  foto_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo := tenants.dispositivo_por_token(p_token);
  v_trabajador record;
  v_zona text;
  v_ultimo text;
  v_tipo text;
  v_evento jornada.evento;
begin
  select t.id, t.nombre
  into v_trabajador
  from tenants.trabajador t
  where t.centro_id = v_dispositivo.centro_id
    and t.fecha_baja is null
    and (
      (p_qr is not null and t.qr_token_hash = tenants.hash_token(p_qr))
      or (p_qr is null and p_pin is not null and t.pin_hash is not null and t.pin_hash = extensions.crypt(p_pin, t.pin_hash))
    )
  limit 1;
  if v_trabajador.id is null then
    raise exception 'No reconocemos ese PIN o código en este centro.' using errcode = 'no_data_found';
  end if;

  -- Reenvío de un marcaje que ya había llegado (cola sin conexión).
  select e.* into v_evento
  from jornada.evento e
  where e.trabajador_id = v_trabajador.id and e.client_event_id = p_client_event_id;
  if v_evento.id is not null then
    return query select v_evento.id, true, v_trabajador.id, v_trabajador.nombre, v_evento.tipo,
      v_evento.ts_servidor, v_evento.foto_url;
    return;
  end if;

  -- Entrada o salida según el último marcaje del mismo día (hora del centro),
  -- visto desde la hora en que se hizo este marcaje.
  select c.zona_horaria into v_zona from tenants.centro_trabajo c where c.id = v_dispositivo.centro_id;
  select m.tipo into v_ultimo
  from jornada.marcajes_vigentes(
    v_dispositivo.tenant_id, v_trabajador.id, p_ts_dispositivo - interval '16 hours', p_ts_dispositivo
  ) m
  where m.tipo in ('entrada', 'salida')
  order by m.hora desc, m.id desc
  limit 1;
  v_tipo := case when v_ultimo = 'entrada' then 'salida' else 'entrada' end;

  insert into jornada.evento
    (tenant_id, trabajador_id, tipo, origen, creado_por, client_event_id, ts_dispositivo, foto_hash, dispositivo_id)
  values
    (v_dispositivo.tenant_id, v_trabajador.id, v_tipo, 'kiosco', v_dispositivo.usuario_id, p_client_event_id,
     p_ts_dispositivo, p_foto_hash, v_dispositivo.id::text)
  returning * into v_evento;

  return query select v_evento.id, false, v_trabajador.id, v_trabajador.nombre, v_evento.tipo,
    v_evento.ts_servidor, v_evento.foto_url;
end;
$$;

comment on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text)
  is 'Marcaje desde un kiosco vinculado: identifica por PIN o QR, decide entrada o salida e inserta el evento.';

-- El token del dispositivo es la credencial: estas funciones se llaman sin sesión.
revoke all on function tenants.vincular_dispositivo(text) from public;
revoke all on function tenants.kiosco_estado(text) from public;
revoke all on function tenants.desvincular_dispositivo(text, text) from public;
revoke all on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text) from public;
grant execute on function tenants.vincular_dispositivo(text) to anon, authenticated, service_role;
grant execute on function tenants.kiosco_estado(text) to anon, authenticated, service_role;
grant execute on function tenants.desvincular_dispositivo(text, text) to anon, authenticated, service_role;
grant execute on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text) to anon, authenticated, service_role;
grant usage on schema tenants, jornada to anon;

-- ---------------------------------------------------------------- purga de fotos

-- Las fotos de marcaje se conservan 90 días; en el evento queda su hash.
create function jornada.fotos_por_purgar(p_limite integer default 500)
returns table (ruta text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'marcajes' and o.created_at < now() - interval '90 days'
  order by o.created_at
  limit p_limite;
$$;

revoke all on function jornada.fotos_por_purgar(integer) from public;
grant execute on function jornada.fotos_por_purgar(integer) to service_role;
