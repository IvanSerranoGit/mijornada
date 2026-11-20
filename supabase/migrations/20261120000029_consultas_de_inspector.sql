-- Rastro de lo que hizo el inspector con un reporte (abrirlo, verificarlo, descargar sus
-- archivos), para mostrarlo al patrón. Lee auditoria.bitacora_admin, que no está expuesta
-- en la API; solo responde a un administrador del tenant del reporte.
create function cumplimiento.consultas_de_inspector(p_reporte_id uuid)
returns table (accion text, ip inet, ts timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.accion, b.ip, b.ts
  from auditoria.bitacora_admin b
  join cumplimiento.reporte r on r.id = b.entidad_id and r.tenant_id = b.tenant_id
  where b.entidad = 'reporte'
    and b.entidad_id = p_reporte_id
    and (b.accion = 'acceso_inspector' or b.accion like 'inspector\_%')
    and tenants.es_admin_de(r.tenant_id)
  order by b.ts;
$$;

comment on function cumplimiento.consultas_de_inspector(uuid)
  is 'Consultas y descargas del inspector sobre un reporte, con IP y hora. Solo para administradores del tenant.';

revoke all on function cumplimiento.consultas_de_inspector(uuid) from public;
grant execute on function cumplimiento.consultas_de_inspector(uuid) to authenticated;
