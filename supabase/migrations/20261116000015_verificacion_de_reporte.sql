-- Verificación de integridad de un reporte: recorre la cadena de hashes de cada
-- trabajador que abarca el reporte, dentro de su rango de fechas.
--
-- Es lo único, además del propio reporte, que puede consultar un inspector. No
-- devuelve nombres ni datos de contacto: solo el id del trabajador y el resultado.
-- Cada consulta de un inspector queda en auditoria.bitacora_admin con IP y hora.

create function cumplimiento.verificar_reporte(p_reporte_id uuid)
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
  v_zona text;
  v_desde timestamptz;
  v_hasta timestamptz;
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

  select e.zona_horaria into v_zona from tenants.empresa e where e.id = v_reporte.tenant_id;
  v_desde := lower(v_reporte.rango)::timestamp at time zone v_zona;
  v_hasta := upper(v_reporte.rango)::timestamp at time zone v_zona;

  return query
  select t.id, v.integra, v.n_eventos, v.evento_roto_id, v.evento_roto_ts, v.motivo
  from tenants.trabajador t
  cross join lateral jornada.verificar_cadena(t.tenant_id, t.id, v_desde, v_hasta) v
  where t.tenant_id = v_reporte.tenant_id
    and (v_reporte.centro_id is null or t.centro_id = v_reporte.centro_id)
  order by t.id;
end;
$$;

comment on function cumplimiento.verificar_reporte(uuid)
  is 'Verifica la cadena de hashes de cada trabajador del reporte en su rango. La pueden llamar quienes pueden leer el reporte, incluido el inspector.';

revoke all on function cumplimiento.verificar_reporte(uuid) from public;
grant execute on function cumplimiento.verificar_reporte(uuid) to authenticated, service_role;
