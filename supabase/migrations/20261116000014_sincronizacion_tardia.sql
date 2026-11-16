-- Sincronización tardía: un marcaje que llega más de 24 h después de la hora del
-- dispositivo se acepta, pero queda con origen = 'sincronizacion_tardia' y así
-- aparece en el reporte (documento de fundamentos, "Reglas de tiempo").
--
-- Lo decide la base al insertar: el cliente no puede declararlo por su cuenta.

create or replace function jornada.encadenar_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamptz;
  v_prev_hash text;
  v_prev_ts timestamptz;
begin
  -- Con un snapshot fijo no se vería el último evento confirmado y la cadena se bifurcaría.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Los eventos de jornada solo se insertan con aislamiento READ COMMITTED.'
      using errcode = 'feature_not_supported';
  end if;

  -- Candado por trabajador hasta el fin de la transacción: una inserción a la vez por cadena.
  perform pg_advisory_xact_lock(hashtextextended('jornada.evento:' || new.trabajador_id::text, 0));

  -- Sincronización idempotente: un client_event_id repetido no se inserta de nuevo.
  if new.client_event_id is not null and exists (
    select 1
    from jornada.evento e
    where e.trabajador_id = new.trabajador_id
      and e.client_event_id = new.client_event_id
  ) then
    return null;
  end if;

  -- El evento referido debe existir y ser del mismo trabajador.
  if new.referencia_evento_id is not null and not exists (
    select 1
    from jornada.evento e
    where e.id = new.referencia_evento_id
      and e.tenant_id = new.tenant_id
      and e.trabajador_id = new.trabajador_id
  ) then
    raise exception 'El evento referido % no existe para este trabajador.', new.referencia_evento_id
      using errcode = 'foreign_key_violation';
  end if;

  -- La hora oficial la pone el servidor. La fila ya fue enrutada a su partición
  -- mensual, así que no se acepta una hora de otro mes.
  v_ahora := clock_timestamp();
  if date_trunc('month', new.ts_servidor at time zone 'UTC')
     <> date_trunc('month', v_ahora at time zone 'UTC') then
    raise exception 'ts_servidor lo fija el servidor: no se acepta una hora de otro mes.'
      using errcode = 'check_violation';
  end if;
  new.ts_servidor := v_ahora;

  select e.hash, e.ts_servidor
  into v_prev_hash, v_prev_ts
  from jornada.evento e
  where e.tenant_id = new.tenant_id
    and e.trabajador_id = new.trabajador_id
  order by e.ts_servidor desc, e.id desc
  limit 1;

  -- El orden de la cadena es el de ts_servidor: debe ser estrictamente creciente.
  if v_prev_ts is not null and v_prev_ts >= new.ts_servidor then
    new.ts_servidor := v_prev_ts + interval '1 microsecond';
  end if;

  -- Marcaje diferido: llegó más de 24 h después de la hora del dispositivo.
  if new.origen = 'sincronizacion_tardia' then
    raise exception 'El origen sincronizacion_tardia lo asigna el servidor.'
      using errcode = 'check_violation';
  end if;
  if new.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
     and new.origen in ('pwa', 'kiosco', 'api')
     and new.ts_dispositivo is not null
     and new.ts_servidor - new.ts_dispositivo > interval '24 hours' then
    new.origen := 'sincronizacion_tardia';
  end if;

  new.hash_prev := v_prev_hash;
  new.hash := jornada.calcular_hash_evento(
    new.hash_prev,
    new.tenant_id,
    new.trabajador_id,
    new.tipo,
    new.ts_servidor,
    new.ts_dispositivo,
    new.origen,
    new.lat,
    new.lng,
    new.foto_hash,
    new.creado_por
  );
  return new;
end;
$$;

-- La política se evalúa después del trigger: un marcaje del kiosco o del empleado
-- que el servidor marcó como tardío debe seguir pasando.
drop policy evento_marcaje on jornada.evento;

create policy evento_marcaje on jornada.evento for insert to authenticated
  with check (
    tenant_id = tenants.jwt_tenant_id()
    and creado_por = tenants.jwt_usuario_id()
    and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
    and referencia_evento_id is null
    and (
      (
        tenants.jwt_rol() = 'kiosco'
        and origen in ('kiosco', 'sincronizacion_tardia')
        and tenants.centro_de_trabajador(trabajador_id) = tenants.jwt_centro_id()
      )
      or (
        tenants.jwt_rol() = 'empleado'
        and origen in ('pwa', 'sincronizacion_tardia')
        and trabajador_id = tenants.jwt_trabajador_id()
      )
    )
  );
