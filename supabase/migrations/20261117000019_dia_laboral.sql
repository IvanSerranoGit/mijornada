-- Sprint 2, fase 3: cálculo del día laboral a partir de jornada.evento.
--
-- Reglas:
--   * La hora de un marcaje es la del dispositivo si existe (así una marca hecha sin
--     red cuenta a la hora en que se hizo) y, si no, la del servidor.
--   * El día es el de la zona horaria del centro del trabajador.
--   * Una jornada que cruza la medianoche pertenece al día en que empezó.
--   * Un marcaje anulado no cuenta. Si el día tiene correcciones o anulaciones, su
--     estado es "corregido".
--   * Completo: toda entrada tiene su salida y toda pausa su fin. Si no, incompleto.

create function jornada.hora_efectiva(p_ts_servidor timestamptz, p_ts_dispositivo timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select coalesce(p_ts_dispositivo, p_ts_servidor); $$;

comment on function jornada.hora_efectiva(timestamptz, timestamptz)
  is 'Hora que cuenta para el cálculo de un marcaje: la del dispositivo si existe; si no, la del servidor.';

create function jornada.recalcular_dia(p_tenant_id uuid, p_trabajador_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Una jornada abierta se sigue buscando hasta 16 h después de la medianoche siguiente.
  c_margen constant interval := '16 hours';
  v_zona text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_evento record;
  v_previo text;
  v_arrastre boolean;
  v_abierta timestamptz;
  v_pausa timestamptz;
  v_entrada timestamptz;
  v_salida timestamptz;
  v_trabajado interval := '0';
  v_pausas interval := '0';
  v_hay_marcas boolean := false;
  v_corregido boolean := false;
begin
  select c.zona_horaria
  into v_zona
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = p_trabajador_id and t.tenant_id = p_tenant_id;
  if v_zona is null then
    return;
  end if;

  v_inicio := p_fecha::timestamp at time zone v_zona;
  v_fin := (p_fecha + 1)::timestamp at time zone v_zona;

  -- ¿Venía una jornada abierta del día anterior? Entonces los marcajes hasta su
  -- salida pertenecen a ese día y aquí se saltan.
  select m.tipo
  into v_previo
  from jornada.marcajes_vigentes(p_tenant_id, p_trabajador_id, v_inicio - c_margen, v_inicio) m
  order by m.hora desc, m.id desc
  limit 1;
  v_arrastre := coalesce(v_previo in ('entrada', 'inicio_pausa', 'fin_pausa'), false);

  for v_evento in
    select m.*
    from jornada.marcajes_vigentes(p_tenant_id, p_trabajador_id, v_inicio, v_fin + c_margen) m
    order by m.hora, m.id
  loop
    if v_arrastre then
      if v_evento.tipo = 'salida' then
        v_arrastre := false;
      elsif v_evento.tipo = 'entrada' then
        -- Nunca se cerró la jornada anterior: esta entrada ya es del día.
        v_arrastre := false;
      end if;
      continue when v_evento.tipo <> 'entrada';
    end if;

    -- Pasada la medianoche solo interesa cerrar lo que quedó abierto.
    exit when v_evento.hora >= v_fin and v_abierta is null;
    exit when v_evento.hora >= v_fin and v_evento.tipo = 'entrada';

    v_hay_marcas := true;
    v_corregido := v_corregido or v_evento.corregido;

    case v_evento.tipo
      when 'entrada' then
        if v_abierta is null then
          v_abierta := v_evento.hora;
          v_entrada := coalesce(v_entrada, v_evento.hora);
        end if;
      when 'inicio_pausa' then
        if v_abierta is not null and v_pausa is null then
          v_pausa := v_evento.hora;
        end if;
      when 'fin_pausa' then
        if v_pausa is not null then
          v_pausas := v_pausas + (v_evento.hora - v_pausa);
          v_pausa := null;
        end if;
      when 'salida' then
        if v_abierta is not null then
          if v_pausa is not null then
            v_pausas := v_pausas + (v_evento.hora - v_pausa);
            v_pausa := null;
          end if;
          v_trabajado := v_trabajado + (v_evento.hora - v_abierta);
          v_abierta := null;
        end if;
        v_salida := v_evento.hora;
      else
        null;
    end case;
  end loop;

  -- Anulaciones de marcajes de este día: el día queda como corregido aunque no queden marcas.
  v_corregido := v_corregido or exists (
    select 1
    from jornada.evento a
    join jornada.evento o on o.id = a.referencia_evento_id
    where a.tenant_id = p_tenant_id
      and a.trabajador_id = p_trabajador_id
      and a.tipo in ('anulacion', 'correccion')
      and jornada.hora_efectiva(o.ts_servidor, o.ts_dispositivo) >= v_inicio
      and jornada.hora_efectiva(o.ts_servidor, o.ts_dispositivo) < v_fin
  );

  if not v_hay_marcas and not v_corregido then
    delete from jornada.dia_laboral d
    where d.tenant_id = p_tenant_id and d.trabajador_id = p_trabajador_id and d.fecha = p_fecha;
    return;
  end if;

  insert into jornada.dia_laboral as d
    (tenant_id, trabajador_id, fecha, entrada, salida, pausas_min, minutos_trabajados, estado, recalculado_en)
  values (
    p_tenant_id,
    p_trabajador_id,
    p_fecha,
    v_entrada,
    case when v_abierta is null then v_salida end,
    greatest(floor(extract(epoch from v_pausas) / 60), 0)::integer,
    greatest(floor(extract(epoch from (v_trabajado - v_pausas)) / 60), 0)::integer,
    case
      when v_corregido then 'corregido'
      when v_entrada is not null and v_abierta is null and v_pausa is null then 'completo'
      else 'incompleto'
    end,
    now()
  )
  on conflict (tenant_id, trabajador_id, fecha) do update
  set entrada = excluded.entrada,
      salida = excluded.salida,
      pausas_min = excluded.pausas_min,
      minutos_trabajados = excluded.minutos_trabajados,
      estado = excluded.estado,
      recalculado_en = excluded.recalculado_en;
end;
$$;

comment on function jornada.recalcular_dia(uuid, uuid, date)
  is 'Reconstruye la fila de jornada.dia_laboral de un trabajador y una fecha a partir de sus eventos.';

-- Marcajes de un trabajador en un intervalo, con su hora efectiva, sin los anulados.
create function jornada.marcajes_vigentes(
  p_tenant_id uuid,
  p_trabajador_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (id uuid, tipo text, hora timestamptz, corregido boolean)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.tipo,
    jornada.hora_efectiva(e.ts_servidor, e.ts_dispositivo),
    exists (
      select 1 from jornada.evento c
      where c.referencia_evento_id = e.id and c.tipo = 'correccion'
    )
  from jornada.evento e
  where e.tenant_id = p_tenant_id
    and e.trabajador_id = p_trabajador_id
    and e.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
    and jornada.hora_efectiva(e.ts_servidor, e.ts_dispositivo) >= p_desde
    and jornada.hora_efectiva(e.ts_servidor, e.ts_dispositivo) < p_hasta
    and not exists (
      select 1 from jornada.evento a
      where a.referencia_evento_id = e.id and a.tipo = 'anulacion'
    );
$$;

-- Índice para buscar marcajes por hora efectiva.
create index evento_hora_efectiva_idx
  on jornada.evento (tenant_id, trabajador_id, (jornada.hora_efectiva(ts_servidor, ts_dispositivo)));

-- Al insertar un evento se recalcula su día (y el anterior, por si cierra una
-- jornada que empezó antes de medianoche).
create function jornada.recalcular_dia_por_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text;
  v_hora timestamptz;
  v_fecha date;
begin
  select c.zona_horaria
  into v_zona
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = new.trabajador_id;

  if new.referencia_evento_id is not null then
    -- Una corrección o anulación afecta al día del evento original.
    select jornada.hora_efectiva(o.ts_servidor, o.ts_dispositivo)
    into v_hora
    from jornada.evento o
    where o.id = new.referencia_evento_id;
  end if;
  v_hora := coalesce(v_hora, jornada.hora_efectiva(new.ts_servidor, new.ts_dispositivo));
  v_fecha := (v_hora at time zone v_zona)::date;

  perform jornada.recalcular_dia(new.tenant_id, new.trabajador_id, v_fecha - 1);
  perform jornada.recalcular_dia(new.tenant_id, new.trabajador_id, v_fecha);
  return null;
end;
$$;

create trigger evento_recalcula_dia
  after insert on jornada.evento
  for each row execute function jornada.recalcular_dia_por_evento();

-- Reconstrucción masiva: borra y vuelve a calcular todos los días del tenant en el rango.
create function jornada.recalcular_rango(p_tenant_id uuid, p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trabajador record;
  v_fecha date;
  v_dias integer := 0;
begin
  -- Con sesión, solo un administrador del tenant; sin sesión (jobs del servidor), sin restricción.
  if auth.uid() is not null and not tenants.es_admin_de(p_tenant_id) then
    raise exception 'Solo un administrador puede recalcular los días.' using errcode = 'insufficient_privilege';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'El rango debe ser de un año como máximo.' using errcode = 'check_violation';
  end if;

  delete from jornada.dia_laboral d
  where d.tenant_id = p_tenant_id and d.fecha between p_desde and p_hasta;

  for v_trabajador in select t.id from tenants.trabajador t where t.tenant_id = p_tenant_id loop
    v_fecha := p_desde;
    while v_fecha <= p_hasta loop
      perform jornada.recalcular_dia(p_tenant_id, v_trabajador.id, v_fecha);
      v_fecha := v_fecha + 1;
    end loop;
  end loop;

  select count(*) into v_dias
  from jornada.dia_laboral d
  where d.tenant_id = p_tenant_id and d.fecha between p_desde and p_hasta;
  return v_dias;
end;
$$;

comment on function jornada.recalcular_rango(uuid, date, date)
  is 'Borra y reconstruye jornada.dia_laboral de todo el tenant entre dos fechas. Devuelve cuántos días quedaron.';

revoke all on function jornada.recalcular_dia(uuid, uuid, date) from public;
revoke all on function jornada.recalcular_rango(uuid, date, date) from public;
revoke all on function jornada.marcajes_vigentes(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function jornada.recalcular_dia(uuid, uuid, date) to service_role;
grant execute on function jornada.recalcular_rango(uuid, date, date) to authenticated, service_role;
