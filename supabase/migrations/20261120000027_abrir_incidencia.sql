-- Abre una incidencia a partir de lo que captura una persona: la fecha y la hora locales
-- del centro. La hora declarada (ts_declarado) se arma aquí, con la zona horaria del centro,
-- para que no dependa del reloj ni de la zona del dispositivo.
-- Corre con los permisos de quien llama: aplica la política incidencia_alta.
create function cumplimiento.abrir_incidencia(
  p_trabajador_id uuid,
  p_fecha date,
  p_tipo text,
  p_motivo text,
  p_hora time default null,
  p_tipo_marcaje text default null,
  p_evento_referido_id uuid default null
)
returns cumplimiento.incidencia
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_zona text;
  v_incidencia cumplimiento.incidencia;
begin
  select t.tenant_id, c.zona_horaria
  into v_tenant_id, v_zona
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = p_trabajador_id;
  if v_tenant_id is null then
    raise exception 'La persona no existe o no tienes acceso.' using errcode = 'no_data_found';
  end if;

  if p_tipo in ('olvido', 'correccion_hora') and p_hora is null then
    raise exception 'Indica la hora que corresponde.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'olvido' and p_tipo_marcaje is null then
    raise exception 'Indica qué marca faltó.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'correccion_hora' and p_evento_referido_id is null then
    raise exception 'Indica la marca que quieres corregir.' using errcode = 'check_violation';
  end if;
  if p_fecha > (now() at time zone v_zona)::date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'check_violation';
  end if;
  if p_evento_referido_id is not null and not exists (
    select 1 from jornada.evento e
    where e.id = p_evento_referido_id
      and e.trabajador_id = p_trabajador_id
      and e.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
  ) then
    raise exception 'La marca que quieres corregir no existe.' using errcode = 'no_data_found';
  end if;

  insert into cumplimiento.incidencia
    (tenant_id, trabajador_id, fecha, tipo, motivo, solicitado_por, tipo_marcaje, evento_referido_id, ts_declarado)
  values (
    v_tenant_id, p_trabajador_id, p_fecha, p_tipo, btrim(p_motivo), tenants.jwt_usuario_id(),
    case when p_tipo = 'olvido' then p_tipo_marcaje end,
    case when p_tipo = 'correccion_hora' then p_evento_referido_id end,
    case when p_tipo in ('olvido', 'correccion_hora') then (p_fecha + p_hora) at time zone v_zona end
  )
  returning * into v_incidencia;
  return v_incidencia;
end;
$$;

comment on function cumplimiento.abrir_incidencia(uuid, date, text, text, time, text, uuid)
  is 'Abre una incidencia con la fecha y la hora locales del centro; arma ts_declarado con su zona horaria.';

revoke all on function cumplimiento.abrir_incidencia(uuid, date, text, text, time, text, uuid) from public;
grant execute on function cumplimiento.abrir_incidencia(uuid, date, text, text, time, text, uuid) to authenticated;
