-- Sprint 2, fase 1: alta de empresa, trabajadores con PIN y QR, método de marcaje
-- por centro y dispositivos de kiosco.

-- ---------------------------------------------------------------- columnas nuevas

alter table tenants.empresa
  add column onboarding_completado_en timestamptz;

comment on column tenants.empresa.onboarding_completado_en is 'Cuándo el dueño terminó el onboarding; null mientras siga en curso.';

alter table tenants.centro_trabajo
  add column metodo_marcaje text check (metodo_marcaje in ('kiosco', 'telefono', 'ambos')),
  add column foto_en_kiosco boolean not null default true,
  add column foto_en_telefono boolean not null default false;

comment on column tenants.centro_trabajo.metodo_marcaje is 'Cómo marcan los trabajadores del centro: kiosco, teléfono propio o ambos. Null hasta que el dueño lo elige.';
comment on column tenants.centro_trabajo.foto_en_kiosco is 'El kiosco toma foto al marcar (activada por defecto).';
comment on column tenants.centro_trabajo.foto_en_telefono is 'La PWA exige foto al marcar (opcional).';

grant update (metodo_marcaje, foto_en_kiosco, foto_en_telefono) on tenants.centro_trabajo to authenticated;

alter table tenants.trabajador
  add column qr_token_hash text unique check (qr_token_hash ~ '^[0-9a-f]{64}$');

comment on column tenants.trabajador.qr_token_hash is 'SHA-256 del token opaco que va en el QR del trabajador; el token no se guarda.';

-- El kiosco es un usuario de dispositivo: no tiene cuenta en Supabase Auth.
alter table tenants.usuario
  alter column auth_user_id drop not null,
  add constraint usuario_auth_user_check check (rol = 'kiosco' or auth_user_id is not null);

grant update (onboarding_completado_en) on tenants.empresa to authenticated;

-- ---------------------------------------------------------------- alta de empresa

-- Única forma de crear una empresa desde el cliente. Crea la empresa en plan de
-- prueba y al usuario que llama como su dueño. Después de llamarla hay que
-- refrescar la sesión para recibir los claims nuevos.
create function tenants.crear_empresa(
  razon_social text,
  rfc text,
  tamano text,
  sector text,
  jurisdiccion_sugerida text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_empresa_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Inicia sesión para dar de alta una empresa.' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from tenants.usuario u where u.auth_user_id = v_auth_user_id and u.activo) then
    raise exception 'Tu cuenta ya pertenece a una empresa.' using errcode = 'unique_violation';
  end if;

  insert into tenants.empresa (razon_social, rfc, tamano, sector, jurisdiccion, plan)
  values (
    btrim(crear_empresa.razon_social),
    nullif(upper(btrim(crear_empresa.rfc)), ''),
    crear_empresa.tamano,
    nullif(btrim(crear_empresa.sector), ''),
    crear_empresa.jurisdiccion_sugerida,
    'prueba'
  )
  returning id into v_empresa_id;

  insert into tenants.usuario (tenant_id, auth_user_id, rol)
  values (v_empresa_id, v_auth_user_id, 'dueno');

  return v_empresa_id;
end;
$$;

comment on function tenants.crear_empresa(text, text, text, text, text)
  is 'Crea la empresa (plan de prueba) y al usuario que llama como dueño. Devuelve el id de la empresa.';

revoke all on function tenants.crear_empresa(text, text, text, text, text) from public;
grant execute on function tenants.crear_empresa(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- PIN y QR

-- PIN de 4 dígitos que no repite ninguno del mismo centro (el kiosco identifica
-- al trabajador solo con el PIN).
create function tenants.generar_pin(p_centro_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin text;
begin
  for i in 1..200 loop
    v_pin := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text, 4, '0');
    if not exists (
      select 1
      from tenants.trabajador t
      where t.centro_id = p_centro_id
        and t.pin_hash is not null
        and t.pin_hash = extensions.crypt(v_pin, t.pin_hash)
    ) then
      return v_pin;
    end if;
  end loop;
  raise exception 'No se pudo generar un PIN libre para el centro.';
end;
$$;

revoke all on function tenants.generar_pin(uuid) from public;

create function tenants.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex'); $$;

create function tenants.generar_token(p_bytes integer default 24)
returns text
language sql
volatile
set search_path = ''
as $$ select translate(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+/=', '-_'); $$;

-- Alta de trabajador con su horario. Devuelve el PIN y el token del QR en claro
-- por única vez: en la base solo quedan sus hashes.
create function tenants.crear_trabajador(
  centro_id uuid,
  nombre text,
  puesto text default null,
  menor_de_edad boolean default false,
  tipo_jornada text default 'diurna',
  curp text default null,
  nss text default null,
  dias jsonb default null,
  hora_entrada time default null,
  hora_salida time default null,
  descanso_semanal smallint[] default null
)
returns table (id uuid, pin text, qr_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
  v_pin text;
  v_qr text;
begin
  select c.tenant_id into v_tenant_id from tenants.centro_trabajo c where c.id = crear_trabajador.centro_id;
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'El centro de trabajo no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  v_pin := tenants.generar_pin(crear_trabajador.centro_id);
  v_qr := tenants.generar_token();

  insert into tenants.trabajador as t
    (tenant_id, centro_id, nombre, puesto, menor_de_edad, tipo_jornada, curp_cifrado, nss_cifrado, pin_hash, qr_token_hash)
  values (
    v_tenant_id,
    crear_trabajador.centro_id,
    btrim(crear_trabajador.nombre),
    nullif(btrim(crear_trabajador.puesto), ''),
    crear_trabajador.menor_de_edad,
    crear_trabajador.tipo_jornada,
    tenants.cifrar(v_tenant_id, nullif(upper(btrim(crear_trabajador.curp)), '')),
    tenants.cifrar(v_tenant_id, nullif(btrim(crear_trabajador.nss), '')),
    extensions.crypt(v_pin, extensions.gen_salt('bf', 6)),
    tenants.hash_token(v_qr)
  )
  returning t.id into v_id;

  if crear_trabajador.dias is not null then
    insert into tenants.horario (tenant_id, trabajador_id, vigente_desde, dias, hora_entrada, hora_salida, descanso_semanal)
    values (
      v_tenant_id,
      v_id,
      current_date,
      crear_trabajador.dias,
      crear_trabajador.hora_entrada,
      crear_trabajador.hora_salida,
      coalesce(crear_trabajador.descanso_semanal, '{7}')
    );
  end if;

  return query select v_id, v_pin, v_qr;
end;
$$;

comment on function tenants.crear_trabajador(uuid, text, text, boolean, text, text, text, jsonb, time, time, smallint[])
  is 'Alta de trabajador con horario, CURP y NSS cifrados, PIN de 4 dígitos (bcrypt) y token de QR. Devuelve PIN y token en claro una sola vez.';

-- Genera un PIN y un QR nuevos; los anteriores dejan de servir.
create function tenants.regenerar_credenciales(trabajador_id uuid)
returns table (pin text, qr_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajador tenants.trabajador;
  v_pin text;
  v_qr text;
begin
  select t.* into v_trabajador from tenants.trabajador t where t.id = regenerar_credenciales.trabajador_id;
  if v_trabajador.id is null or not tenants.es_admin_de(v_trabajador.tenant_id) then
    raise exception 'El trabajador no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  v_pin := tenants.generar_pin(v_trabajador.centro_id);
  v_qr := tenants.generar_token();
  update tenants.trabajador t
  set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 6)),
      qr_token_hash = tenants.hash_token(v_qr)
  where t.id = v_trabajador.id;

  return query select v_pin, v_qr;
end;
$$;

revoke all on function tenants.crear_trabajador(uuid, text, text, boolean, text, text, text, jsonb, time, time, smallint[]) from public;
revoke all on function tenants.regenerar_credenciales(uuid) from public;
grant execute on function tenants.crear_trabajador(uuid, text, text, boolean, text, text, text, jsonb, time, time, smallint[]) to authenticated;
grant execute on function tenants.regenerar_credenciales(uuid) to authenticated;

-- ---------------------------------------------------------------- dispositivos de kiosco

-- Una tablet de kiosco. Nace con un código de enlace de un solo uso; al canjearlo
-- recibe un token de dispositivo de larga vida. En la base solo hay hashes.
create table tenants.dispositivo (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  centro_id uuid not null,
  nombre text not null default 'Kiosco',
  usuario_id uuid not null references tenants.usuario (id),
  codigo_enlace_hash text,
  codigo_expira_en timestamptz,
  token_hash text unique,
  vinculado_en timestamptz,
  ultimo_uso timestamptz,
  revocado_en timestamptz,
  creado_por uuid references tenants.usuario (id),
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, centro_id) references tenants.centro_trabajo (tenant_id, id)
);

comment on table tenants.dispositivo is 'Tablet de kiosco vinculada a un centro. usuario_id es su usuario con rol kiosco (autor de los eventos que inserta).';

create unique index dispositivo_codigo_idx on tenants.dispositivo (codigo_enlace_hash)
  where codigo_enlace_hash is not null;
create index dispositivo_centro_idx on tenants.dispositivo (tenant_id, centro_id);

alter table tenants.dispositivo enable row level security;
grant select, insert, update, delete on tenants.dispositivo to service_role;
grant select (id, tenant_id, centro_id, nombre, codigo_expira_en, vinculado_en, ultimo_uso, revocado_en, creado_en)
  on tenants.dispositivo to authenticated;

create policy dispositivo_lectura on tenants.dispositivo for select to authenticated
  using (tenants.es_admin_de(tenant_id) or tenants.es_supervisor_de_centro(tenant_id, centro_id));

-- Crea el dispositivo y devuelve su código de enlace de 8 caracteres (vigente 7 días).
create function tenants.generar_codigo_enlace(centro_id uuid, nombre text default 'Kiosco')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Sin 0/O ni 1/I/L para que se pueda dictar y teclear sin confusiones.
  c_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_tenant_id uuid;
  v_usuario_id uuid;
  v_codigo text := '';
  v_bytes bytea := extensions.gen_random_bytes(8);
begin
  select c.tenant_id into v_tenant_id from tenants.centro_trabajo c where c.id = generar_codigo_enlace.centro_id;
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'El centro de trabajo no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  for i in 0..7 loop
    v_codigo := v_codigo || substr(c_alfabeto, 1 + get_byte(v_bytes, i) % length(c_alfabeto), 1);
  end loop;

  insert into tenants.usuario (tenant_id, rol, centro_id)
  values (v_tenant_id, 'kiosco', generar_codigo_enlace.centro_id)
  returning id into v_usuario_id;

  insert into tenants.dispositivo (tenant_id, centro_id, nombre, usuario_id, codigo_enlace_hash, codigo_expira_en, creado_por)
  values (
    v_tenant_id,
    generar_codigo_enlace.centro_id,
    coalesce(nullif(btrim(generar_codigo_enlace.nombre), ''), 'Kiosco'),
    v_usuario_id,
    tenants.hash_token(v_codigo),
    now() + interval '7 days',
    tenants.jwt_usuario_id()
  );

  return v_codigo;
end;
$$;

comment on function tenants.generar_codigo_enlace(uuid, text)
  is 'Da de alta una tablet de kiosco para el centro y devuelve su código de enlace de un solo uso.';

revoke all on function tenants.generar_codigo_enlace(uuid, text) from public;
grant execute on function tenants.generar_codigo_enlace(uuid, text) to authenticated;
