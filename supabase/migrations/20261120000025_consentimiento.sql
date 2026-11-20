-- Sprint 3, fase 1: consentimiento de los trabajadores.
--
--   * Solo cuenta la aceptación de la versión vigente de cada documento (la más alta
--     por tipo). Subir una versión nueva deja el consentimiento pendiente.
--   * Métodos: firma_simple (PWA: nombre completo tecleado), clic (kiosco: "Acepto y
--     marco" con PIN o QR; solo cubre el aviso de privacidad, que es lo que se muestra)
--     y firma_autografa (el patrón sube el documento firmado). Pueden convivir varios
--     métodos para el mismo documento; todos se conservan.
--   * Las aceptaciones electrónicas pasan por funciones: la hora la pone el servidor,
--     el nombre se compara con el registrado y la evidencia se calcula aquí:
--       evidencia_hash = SHA-256(documento_hash | trabajador_id | nombre_tecleado | aceptado_en | ip)
--     unidos con "|" en UTF-8; aceptado_en en UTC con microsegundos; nombre e ip vacíos
--     si no existen. La réplica está en packages/dominio (consentEvidenceHash).
--   * No aceptar nunca impide marcar: la obligación de registrar es del patrón.

create extension if not exists unaccent with schema extensions;

alter table cumplimiento.consentimiento
  drop constraint consentimiento_trabajador_id_documento_id_key,
  add constraint consentimiento_unico_por_metodo unique (trabajador_id, documento_id, metodo),
  add column nombre_tecleado text,
  add column archivo_url text,
  add column archivo_hash text check (archivo_hash ~ '^[0-9a-f]{64}$'),
  add column registrado_por uuid references tenants.usuario (id),
  add constraint consentimiento_firma_simple check (metodo <> 'firma_simple' or nombre_tecleado is not null),
  add constraint consentimiento_firma_autografa
    check ((metodo = 'firma_autografa') = (archivo_url is not null and archivo_hash is not null));

comment on column cumplimiento.consentimiento.nombre_tecleado is 'Nombre completo tal como lo tecleó el trabajador (firma simple).';
comment on column cumplimiento.consentimiento.archivo_url is 'Ruta en el bucket documentos del ejemplar con firma autógrafa.';
comment on column cumplimiento.consentimiento.archivo_hash is 'SHA-256 del archivo con la firma autógrafa.';
comment on column cumplimiento.consentimiento.registrado_por is 'Usuario que registró la aceptación: el trabajador, el kiosco o quien subió la firma autógrafa.';

create index consentimiento_documento_idx on cumplimiento.consentimiento (tenant_id, documento_id);

-- Nombre sin acentos, en minúsculas y con espacios simples, para comparar lo tecleado.
create function cumplimiento.normalizar_nombre(p_nombre text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(extensions.unaccent(coalesce(p_nombre, ''))), '\s+', ' ', 'g'));
$$;

-- Versión vigente de cada tipo de documento de un tenant.
create function cumplimiento.documentos_vigentes(p_tenant_id uuid)
returns setof cumplimiento.documento
language sql
stable
set search_path = ''
as $$
  select distinct on (d.tipo) d.*
  from cumplimiento.documento d
  where d.tenant_id = p_tenant_id
  order by d.tipo, d.version desc;
$$;

comment on function cumplimiento.documentos_vigentes(uuid)
  is 'La versión más alta de cada tipo de documento del tenant. Respeta RLS de quien llama.';

create function cumplimiento.calcular_evidencia(
  p_documento_hash text,
  p_trabajador_id uuid,
  p_nombre_tecleado text,
  p_aceptado_en timestamptz,
  p_ip inet
)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    sha256(
      convert_to(
        array_to_string(
          array[
            p_documento_hash,
            p_trabajador_id::text,
            coalesce(p_nombre_tecleado, ''),
            to_char(p_aceptado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            coalesce(host(p_ip), '')
          ],
          '|'
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

comment on function cumplimiento.calcular_evidencia(text, uuid, text, timestamptz, inet)
  is 'Evidencia de una aceptación: SHA-256(documento_hash | trabajador_id | nombre_tecleado | aceptado_en | ip).';

-- Inserta la aceptación (o devuelve la que ya existía con ese método).
create function cumplimiento.registrar_aceptacion(
  p_documento cumplimiento.documento,
  p_trabajador_id uuid,
  p_metodo text,
  p_nombre_tecleado text,
  p_ip inet,
  p_user_agent text,
  p_registrado_por uuid
)
returns cumplimiento.consentimiento
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consentimiento cumplimiento.consentimiento;
  v_ahora timestamptz := clock_timestamp();
begin
  if p_documento.id is null or not exists (
    select 1 from cumplimiento.documentos_vigentes(p_documento.tenant_id) v where v.id = p_documento.id
  ) then
    raise exception 'Ese documento ya no es la versión vigente.' using errcode = 'check_violation';
  end if;

  insert into cumplimiento.consentimiento
    (tenant_id, trabajador_id, documento_id, aceptado_en, ip, user_agent, metodo, nombre_tecleado,
     evidencia_hash, registrado_por)
  values (
    p_documento.tenant_id, p_trabajador_id, p_documento.id, v_ahora, p_ip, left(p_user_agent, 300), p_metodo,
    p_nombre_tecleado,
    cumplimiento.calcular_evidencia(p_documento.contenido_hash, p_trabajador_id, p_nombre_tecleado, v_ahora, p_ip),
    p_registrado_por
  )
  on conflict (trabajador_id, documento_id, metodo) do nothing
  returning * into v_consentimiento;

  if v_consentimiento.id is null then
    select c.* into v_consentimiento
    from cumplimiento.consentimiento c
    where c.trabajador_id = p_trabajador_id and c.documento_id = p_documento.id and c.metodo = p_metodo;
  end if;
  return v_consentimiento;
end;
$$;

revoke all on function cumplimiento.registrar_aceptacion(cumplimiento.documento, uuid, text, text, inet, text, uuid) from public;

-- PWA: el trabajador acepta la versión vigente tecleando su nombre completo.
create function cumplimiento.aceptar_documento(
  p_documento_id uuid,
  p_nombre text,
  p_ip inet default null,
  p_user_agent text default null
)
returns table (consentimiento_id uuid, aceptado_en timestamptz, evidencia_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajador_id uuid := tenants.jwt_trabajador_id();
  v_documento cumplimiento.documento;
  v_nombre text;
  v_consentimiento cumplimiento.consentimiento;
begin
  if tenants.jwt_rol() is distinct from 'empleado' or v_trabajador_id is null then
    raise exception 'Solo el propio trabajador puede aceptar sus documentos.' using errcode = 'insufficient_privilege';
  end if;

  select d.* into v_documento
  from cumplimiento.documento d
  where d.id = p_documento_id and d.tenant_id = tenants.jwt_tenant_id();
  if v_documento.id is null then
    raise exception 'El documento no existe.' using errcode = 'no_data_found';
  end if;

  select t.nombre into v_nombre from tenants.trabajador t where t.id = v_trabajador_id;
  if cumplimiento.normalizar_nombre(p_nombre) = ''
     or cumplimiento.normalizar_nombre(p_nombre) <> cumplimiento.normalizar_nombre(v_nombre) then
    raise exception 'El nombre no coincide con el registrado. Escríbelo completo, como aparece en pantalla.'
      using errcode = 'check_violation';
  end if;

  v_consentimiento := cumplimiento.registrar_aceptacion(
    v_documento, v_trabajador_id, 'firma_simple', btrim(p_nombre), p_ip, p_user_agent, tenants.jwt_usuario_id()
  );
  return query select v_consentimiento.id, v_consentimiento.aceptado_en, v_consentimiento.evidencia_hash;
end;
$$;

comment on function cumplimiento.aceptar_documento(uuid, text, inet, text)
  is 'Firma simple: el trabajador acepta la versión vigente de un documento tecleando su nombre completo.';

-- Trabajador activo de un centro por su PIN o su QR (nulo si no coincide ninguno).
create function tenants.trabajador_por_credencial(p_centro_id uuid, p_pin text, p_qr text)
returns tenants.trabajador
language sql
stable
security definer
set search_path = ''
as $$
  select t.*
  from tenants.trabajador t
  where t.centro_id = p_centro_id
    and t.fecha_baja is null
    and (
      (p_qr is not null and t.qr_token_hash = tenants.hash_token(p_qr))
      or (p_qr is null and p_pin is not null and t.pin_hash is not null and t.pin_hash = extensions.crypt(p_pin, t.pin_hash))
    )
  limit 1;
$$;

revoke all on function tenants.trabajador_por_credencial(uuid, text, text) from public;

-- Kiosco, antes de marcar: ¿esta persona tiene pendiente el aviso de privacidad?
-- Devuelve el aviso simplificado y la configuración del centro para mostrarlo.
create function cumplimiento.kiosco_aviso_pendiente(p_token text, p_pin text default null, p_qr text default null)
returns table (
  pendiente boolean,
  nombre text,
  documento_id uuid,
  version integer,
  resumen_md text,
  centro_id uuid,
  metodo_marcaje text,
  foto_en_kiosco boolean,
  foto_en_telefono boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo := tenants.dispositivo_por_token(p_token);
  v_trabajador tenants.trabajador := tenants.trabajador_por_credencial(v_dispositivo.centro_id, p_pin, p_qr);
begin
  if v_trabajador.id is null then
    raise exception 'No reconocemos ese PIN o código en este centro.' using errcode = 'no_data_found';
  end if;

  return query
  select
    not exists (
      select 1 from cumplimiento.consentimiento c
      where c.trabajador_id = v_trabajador.id and c.documento_id = d.id
    ),
    v_trabajador.nombre, d.id, d.version, d.resumen_md, c.id, c.metodo_marcaje, c.foto_en_kiosco, c.foto_en_telefono
  from cumplimiento.documentos_vigentes(v_dispositivo.tenant_id) d
  join tenants.centro_trabajo c on c.id = v_dispositivo.centro_id
  where d.tipo = 'aviso_privacidad';
end;
$$;

-- Kiosco: "Acepto y marco". Registra la aceptación del aviso de privacidad con método clic.
create function cumplimiento.kiosco_aceptar(
  p_token text,
  p_documento_id uuid,
  p_pin text default null,
  p_qr text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns table (consentimiento_id uuid, aceptado_en timestamptz, evidencia_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispositivo tenants.dispositivo := tenants.dispositivo_por_token(p_token);
  v_trabajador tenants.trabajador := tenants.trabajador_por_credencial(v_dispositivo.centro_id, p_pin, p_qr);
  v_documento cumplimiento.documento;
  v_consentimiento cumplimiento.consentimiento;
begin
  if v_trabajador.id is null then
    raise exception 'No reconocemos ese PIN o código en este centro.' using errcode = 'no_data_found';
  end if;

  select d.* into v_documento
  from cumplimiento.documento d
  where d.id = p_documento_id and d.tenant_id = v_dispositivo.tenant_id and d.tipo = 'aviso_privacidad';
  if v_documento.id is null then
    raise exception 'El documento no existe.' using errcode = 'no_data_found';
  end if;

  v_consentimiento := cumplimiento.registrar_aceptacion(
    v_documento, v_trabajador.id, 'clic', null, p_ip, p_user_agent, v_dispositivo.usuario_id
  );
  return query select v_consentimiento.id, v_consentimiento.aceptado_en, v_consentimiento.evidencia_hash;
end;
$$;

-- Estado del consentimiento de cada trabajador activo frente a los documentos vigentes.
create function cumplimiento.estado_consentimientos(p_tenant_id uuid)
returns table (
  trabajador_id uuid,
  documento_id uuid,
  tipo text,
  version integer,
  aceptado boolean,
  metodos text[],
  aceptado_en timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    d.id,
    d.tipo,
    d.version,
    count(c.id) > 0,
    coalesce(array_agg(c.metodo order by c.aceptado_en) filter (where c.id is not null), '{}'),
    min(c.aceptado_en)
  from tenants.trabajador t
  cross join cumplimiento.documentos_vigentes(p_tenant_id) d
  left join cumplimiento.consentimiento c on c.trabajador_id = t.id and c.documento_id = d.id
  where t.tenant_id = p_tenant_id and t.fecha_baja is null
  group by t.id, d.id, d.tipo, d.version;
$$;

comment on function cumplimiento.estado_consentimientos(uuid)
  is 'Por trabajador activo y documento vigente: si lo aceptó, con qué métodos y cuándo. Respeta RLS de quien llama.';

-- Aviso de privacidad vigente del centro, para la página pública que enlaza el aviso simplificado.
create function cumplimiento.aviso_publico(p_centro_id uuid)
returns table (
  razon_social text,
  version integer,
  vigente_desde date,
  contenido_md text,
  metodo_marcaje text,
  foto_en_kiosco boolean,
  foto_en_telefono boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.razon_social, d.version, d.vigente_desde, d.contenido_md, c.metodo_marcaje, c.foto_en_kiosco, c.foto_en_telefono
  from tenants.centro_trabajo c
  join tenants.empresa e on e.id = c.tenant_id
  cross join lateral cumplimiento.documentos_vigentes(c.tenant_id) d
  where c.id = p_centro_id and d.tipo = 'aviso_privacidad';
$$;

comment on function cumplimiento.aviso_publico(uuid)
  is 'Aviso de privacidad integral vigente de un centro. Público: un aviso de privacidad no es confidencial y no lleva datos de trabajadores.';

-- Las aceptaciones electrónicas ya no se insertan directo: solo la firma autógrafa, por el patrón.
drop policy consentimiento_alta on cumplimiento.consentimiento;

create policy consentimiento_alta on cumplimiento.consentimiento for insert to authenticated
  with check (
    tenants.es_admin_de(tenant_id)
    and metodo = 'firma_autografa'
    and registrado_por = tenants.jwt_usuario_id()
    and evidencia_hash is null
  );

revoke all on function cumplimiento.aceptar_documento(uuid, text, inet, text) from public;
revoke all on function cumplimiento.kiosco_aviso_pendiente(text, text, text) from public;
revoke all on function cumplimiento.kiosco_aceptar(text, uuid, text, text, inet, text) from public;
revoke all on function cumplimiento.aviso_publico(uuid) from public;
grant execute on function cumplimiento.aceptar_documento(uuid, text, inet, text) to authenticated;
grant execute on function cumplimiento.kiosco_aviso_pendiente(text, text, text) to anon, authenticated, service_role;
grant execute on function cumplimiento.kiosco_aceptar(text, uuid, text, text, inet, text) to anon, authenticated, service_role;
grant execute on function cumplimiento.aviso_publico(uuid) to anon, authenticated, service_role;
grant execute on function cumplimiento.documentos_vigentes(uuid) to authenticated, service_role;
grant execute on function cumplimiento.estado_consentimientos(uuid) to authenticated, service_role;
grant usage on schema cumplimiento to anon;
