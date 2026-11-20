-- Sprint 3, fase 3: reporte para inspección, acceso de inspector y verificación pública.
--
--   * El reporte (PDF y CSV) se genera en el servidor y se guarda en el bucket privado
--     `reportes`, en la carpeta <tenant>/<reporte>/. La fila la registra
--     cumplimiento.registrar_reporte (solo un administrador).
--   * hash_contenido es el SHA-256 del CSV de eventos; hash_raiz, la raíz Merkle de los
--     hashes de esos eventos en orden de (ts_servidor, id).
--   * Verificación pública: /verificar/<token>. El token solo existe en el PDF (QR y URL);
--     aquí se guarda su hash. La página dice si las cadenas siguen íntegras, cuántos
--     eventos cubre y los sellos del periodo, sin datos personales.
--   * Acceso de inspector: un enlace temporal (72 h, revocable) que abre la sesión de un
--     usuario con rol inspector ligado a ese reporte. Ve el PDF, los CSV y la verificación;
--     cada consulta y cada descarga quedan en auditoria.bitacora_admin.

alter table cumplimiento.reporte
  add column url_csv_dias text,
  add column hash_raiz text check (hash_raiz ~ '^[0-9a-f]{64}$'),
  add column n_eventos integer check (n_eventos >= 0),
  add column trabajador_ids uuid[],
  add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$');

comment on column cumplimiento.reporte.hash_contenido is 'SHA-256 del CSV de eventos del reporte.';
comment on column cumplimiento.reporte.hash_raiz is 'Raíz Merkle de los hashes de los eventos del reporte, en orden de (ts_servidor, id).';
comment on column cumplimiento.reporte.trabajador_ids is 'Personas a las que se limita el reporte; null si abarca a todas las del alcance.';
comment on column cumplimiento.reporte.token_hash is 'Hash del token de la página pública de verificación.';
comment on column cumplimiento.reporte.url_csv is 'Ruta en el bucket reportes del CSV de eventos.';
comment on column cumplimiento.reporte.url_csv_dias is 'Ruta en el bucket reportes del CSV de días laborales.';

alter table cumplimiento.acceso_inspector
  add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$');

comment on column cumplimiento.acceso_inspector.token_hash is 'Hash del token del enlace temporal del inspector.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reportes', 'reportes', false, 52428800, array['application/pdf', 'text/csv'])
on conflict (id) do nothing;

create policy reportes_lectura on storage.objects for select to authenticated
  using (
    bucket_id = 'reportes'
    and (
      tenants.es_admin_de(((storage.foldername(name))[1])::uuid)
      or cumplimiento.inspector_puede_ver_reporte(
        ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid
      )
    )
  );

create policy reportes_subida on storage.objects for insert to authenticated
  with check (bucket_id = 'reportes' and tenants.es_admin_de(((storage.foldername(name))[1])::uuid));

-- Registra un reporte ya generado. Solo un administrador del tenant.
create function cumplimiento.registrar_reporte(
  p_id uuid,
  p_tipo text,
  p_desde date,
  p_hasta date,
  p_centro_id uuid,
  p_trabajador_ids uuid[],
  p_hash_contenido text,
  p_hash_raiz text,
  p_n_eventos integer,
  p_url_pdf text,
  p_url_csv text,
  p_url_csv_dias text,
  p_token_hash text
)
returns cumplimiento.reporte
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := tenants.jwt_tenant_id();
  v_reporte cumplimiento.reporte;
begin
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'Solo un administrador puede generar reportes.' using errcode = 'insufficient_privilege';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'El rango debe ser de un año como máximo.' using errcode = 'check_violation';
  end if;

  insert into cumplimiento.reporte
    (id, tenant_id, tipo, rango, hash_contenido, hash_raiz, n_eventos, url_pdf, url_csv, url_csv_dias,
     solicitante, centro_id, trabajador_ids, token_hash)
  values
    (p_id, v_tenant_id, p_tipo, daterange(p_desde, p_hasta, '[]'), p_hash_contenido, p_hash_raiz, p_n_eventos,
     p_url_pdf, p_url_csv, p_url_csv_dias, tenants.jwt_usuario_id(), p_centro_id, p_trabajador_ids, p_token_hash)
  returning * into v_reporte;
  return v_reporte;
end;
$$;

revoke all on function cumplimiento.registrar_reporte(uuid, text, date, date, uuid, uuid[], text, text, integer, text, text, text, text) from public;
grant execute on function cumplimiento.registrar_reporte(uuid, text, date, date, uuid, uuid[], text, text, integer, text, text, text, text) to authenticated;

-- Cadenas del alcance de un reporte (centro y, si aplica, personas), sin comprobar permisos.
create function cumplimiento.cadenas_de_reporte(p_reporte cumplimiento.reporte)
returns table (
  trabajador_id uuid,
  integra boolean,
  n_eventos bigint,
  evento_roto_id uuid,
  evento_roto_ts timestamptz,
  motivo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona text;
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  select e.zona_horaria into v_zona from tenants.empresa e where e.id = p_reporte.tenant_id;
  v_desde := lower(p_reporte.rango)::timestamp at time zone v_zona;
  v_hasta := upper(p_reporte.rango)::timestamp at time zone v_zona;

  return query
  select t.id, v.integra, v.n_eventos, v.evento_roto_id, v.evento_roto_ts, v.motivo
  from tenants.trabajador t
  cross join lateral jornada.verificar_cadena(t.tenant_id, t.id, v_desde, v_hasta) v
  where t.tenant_id = p_reporte.tenant_id
    and (p_reporte.centro_id is null or t.centro_id = p_reporte.centro_id)
    and (p_reporte.trabajador_ids is null or t.id = any (p_reporte.trabajador_ids))
  order by t.id;
end;
$$;

revoke all on function cumplimiento.cadenas_de_reporte(cumplimiento.reporte) from public;

-- Igual que antes, pero respeta las personas a las que se limita el reporte.
create or replace function cumplimiento.verificar_reporte(p_reporte_id uuid)
returns table (
  trabajador_id uuid,
  integra boolean,
  n_eventos bigint,
  evento_roto_id uuid,
  evento_roto_ts timestamptz,
  motivo text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporte cumplimiento.reporte;
  v_ip inet;
begin
  select r.* into v_reporte from cumplimiento.reporte r where r.id = p_reporte_id;

  -- Mismo criterio que la política de lectura del reporte; el servidor también puede.
  if v_reporte.id is null or not (
    tenants.es_admin_de(v_reporte.tenant_id)
    or (v_reporte.centro_id is not null and tenants.es_supervisor_de_centro(v_reporte.tenant_id, v_reporte.centro_id))
    or cumplimiento.inspector_puede_ver_reporte(v_reporte.tenant_id, v_reporte.id)
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    raise exception 'El reporte no existe o no tienes acceso a él.'
      using errcode = 'insufficient_privilege';
  end if;

  if tenants.jwt_rol() = 'inspector' then
    begin
      v_ip := nullif(btrim(split_part(
        current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1
      )), '')::inet;
    exception when others then
      v_ip := null;
    end;
    insert into auditoria.bitacora_admin (tenant_id, usuario_id, accion, entidad, entidad_id, ip)
    values (v_reporte.tenant_id, tenants.jwt_usuario_id(), 'acceso_inspector', 'reporte', v_reporte.id, v_ip);
  end if;

  return query select * from cumplimiento.cadenas_de_reporte(v_reporte);
end;
$$;

-- Deja constancia de que el inspector abrió o descargó un archivo del reporte.
create function cumplimiento.registrar_consulta_inspector(p_reporte_id uuid, p_accion text, p_ip inet default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := tenants.jwt_tenant_id();
begin
  if not cumplimiento.inspector_puede_ver_reporte(v_tenant_id, p_reporte_id) then
    raise exception 'El reporte no existe o no tienes acceso a él.' using errcode = 'insufficient_privilege';
  end if;
  if p_accion not in ('inspector_abre_reporte', 'inspector_descarga_pdf', 'inspector_descarga_csv_eventos', 'inspector_descarga_csv_dias') then
    raise exception 'Acción desconocida.' using errcode = 'check_violation';
  end if;
  insert into auditoria.bitacora_admin (tenant_id, usuario_id, accion, entidad, entidad_id, ip)
  values (v_tenant_id, tenants.jwt_usuario_id(), p_accion, 'reporte', p_reporte_id, p_ip);
end;
$$;

revoke all on function cumplimiento.registrar_consulta_inspector(uuid, text, inet) from public;
grant execute on function cumplimiento.registrar_consulta_inspector(uuid, text, inet) to authenticated;

-- Crea el usuario inspector y su acceso de 72 h a un reporte. La cuenta de Auth ya la creó
-- el servidor; aquí se comprueba que quien llama administra el tenant del reporte.
create function cumplimiento.crear_acceso_inspector(p_reporte_id uuid, p_auth_user_id uuid, p_token_hash text)
returns cumplimiento.acceso_inspector
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporte cumplimiento.reporte;
  v_usuario_id uuid;
  v_acceso cumplimiento.acceso_inspector;
begin
  select r.* into v_reporte from cumplimiento.reporte r where r.id = p_reporte_id;
  if v_reporte.id is null or not tenants.es_admin_de(v_reporte.tenant_id) then
    raise exception 'El reporte no existe o no puedes compartirlo.' using errcode = 'insufficient_privilege';
  end if;

  insert into tenants.usuario (tenant_id, auth_user_id, rol, nombre)
  values (v_reporte.tenant_id, p_auth_user_id, 'inspector', 'Inspector')
  returning id into v_usuario_id;

  insert into cumplimiento.acceso_inspector (tenant_id, reporte_id, usuario_id, creado_por, token_hash)
  values (v_reporte.tenant_id, v_reporte.id, v_usuario_id, tenants.jwt_usuario_id(), p_token_hash)
  returning * into v_acceso;
  return v_acceso;
end;
$$;

revoke all on function cumplimiento.crear_acceso_inspector(uuid, uuid, text) from public;
grant execute on function cumplimiento.crear_acceso_inspector(uuid, uuid, text) to authenticated;

-- Para el servidor: a qué cuenta corresponde un enlace de inspector vigente.
create function cumplimiento.acceso_inspector_por_token(p_token text)
returns table (correo text, reporte_id uuid, expira_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.email::text, i.reporte_id, i.expira_en
  from cumplimiento.acceso_inspector i
  join tenants.usuario u on u.id = i.usuario_id and u.activo
  join auth.users a on a.id = u.auth_user_id
  where i.token_hash = tenants.hash_token(p_token)
    and i.revocado_en is null
    and i.expira_en > now();
$$;

revoke all on function cumplimiento.acceso_inspector_por_token(text) from public;
grant execute on function cumplimiento.acceso_inspector_por_token(text) to service_role;

-- Verificación pública de un reporte por su token: sin datos personales.
create function cumplimiento.verificacion_publica(p_token text)
returns table (
  tipo text,
  desde date,
  hasta date,
  generado_en timestamptz,
  hash_contenido text,
  hash_raiz text,
  eventos_al_generar integer,
  integra boolean,
  cadenas integer,
  eventos bigint,
  dias_sellados integer,
  ultimo_sello timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reporte cumplimiento.reporte;
begin
  select r.* into v_reporte from cumplimiento.reporte r where r.token_hash = tenants.hash_token(p_token);
  if v_reporte.id is null then
    return;
  end if;

  return query
  select
    v_reporte.tipo,
    lower(v_reporte.rango),
    (upper(v_reporte.rango) - 1)::date,
    v_reporte.generado_en,
    v_reporte.hash_contenido,
    v_reporte.hash_raiz,
    v_reporte.n_eventos,
    coalesce(bool_and(c.integra), true),
    count(*)::integer,
    coalesce(sum(c.n_eventos), 0)::bigint,
    (select count(*)::integer from jornada.sello_diario s
      where s.tenant_id = v_reporte.tenant_id and s.fecha <@ v_reporte.rango),
    (select max(s.sellado_en) from jornada.sello_diario s
      where s.tenant_id = v_reporte.tenant_id and s.fecha <@ v_reporte.rango)
  from cumplimiento.cadenas_de_reporte(v_reporte) c;
end;
$$;

comment on function cumplimiento.verificacion_publica(text)
  is 'Estado de integridad de un reporte para la página pública /verificar/<token>. No devuelve datos personales.';

revoke all on function cumplimiento.verificacion_publica(text) from public;
grant execute on function cumplimiento.verificacion_publica(text) to anon, authenticated, service_role;
