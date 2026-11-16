-- Hash encadenado por trabajador y verificación de la cadena.
--
-- hash = SHA-256(hash_prev || tenant_id || trabajador_id || tipo || ts_servidor ||
--                ts_dispositivo || origen || lat || lng || foto_hash || creado_por)
--
-- Forma canónica (la misma que implementa packages/dominio):
--   * los once campos, en ese orden, unidos con "|" y codificados en UTF-8;
--   * un campo nulo es la cadena vacía (hash_prev lo es en el primer evento);
--   * las horas van en UTC con microsegundos: 2027-01-04T15:00:00.000000Z;
--   * lat y lng llevan siempre seis decimales: 19.432608.

create function jornada.calcular_hash_evento(
  p_hash_prev text,
  p_tenant_id uuid,
  p_trabajador_id uuid,
  p_tipo text,
  p_ts_servidor timestamptz,
  p_ts_dispositivo timestamptz,
  p_origen text,
  p_lat numeric,
  p_lng numeric,
  p_foto_hash text,
  p_creado_por uuid
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
            coalesce(p_hash_prev, ''),
            p_tenant_id::text,
            p_trabajador_id::text,
            p_tipo,
            to_char(p_ts_servidor at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            coalesce(to_char(p_ts_dispositivo at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            p_origen,
            coalesce(round(p_lat, 6)::text, ''),
            coalesce(round(p_lng, 6)::text, ''),
            coalesce(p_foto_hash, ''),
            p_creado_por::text
          ],
          '|'
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

comment on function jornada.calcular_hash_evento(text, uuid, uuid, text, timestamptz, timestamptz, text, numeric, numeric, text, uuid)
  is 'SHA-256 encadenado de un evento, en hexadecimal.';

-- Al insertar: fija ts_servidor, toma hash_prev del último evento del trabajador
-- (con candado por trabajador) y calcula el hash. Lo que mande el cliente en
-- ts_servidor, hash_prev y hash se ignora.
create function jornada.encadenar_evento()
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

create trigger evento_encadena
  before insert on jornada.evento
  for each row execute function jornada.encadenar_evento();

-- Recorre la cadena de un trabajador y dice si está íntegra y dónde se rompe.
-- Con rango, el primer evento se valida contra el anterior fuera del rango.
create function jornada.verificar_cadena(
  p_tenant_id uuid,
  p_trabajador_id uuid,
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  integra boolean,
  n_eventos bigint,
  evento_roto_id uuid,
  evento_roto_ts timestamptz,
  motivo text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_evento record;
  v_prev_hash text;
  v_n bigint := 0;
begin
  if p_desde is not null then
    select e.hash
    into v_prev_hash
    from jornada.evento e
    where e.tenant_id = p_tenant_id
      and e.trabajador_id = p_trabajador_id
      and e.ts_servidor < p_desde
    order by e.ts_servidor desc, e.id desc
    limit 1;
  end if;

  for v_evento in
    select e.*
    from jornada.evento e
    where e.tenant_id = p_tenant_id
      and e.trabajador_id = p_trabajador_id
      and (p_desde is null or e.ts_servidor >= p_desde)
      and (p_hasta is null or e.ts_servidor < p_hasta)
    order by e.ts_servidor, e.id
  loop
    v_n := v_n + 1;

    if v_evento.hash_prev is distinct from v_prev_hash then
      return query select false, v_n, v_evento.id, v_evento.ts_servidor,
        'hash_prev no coincide con el hash del evento anterior'::text;
      return;
    end if;

    if v_evento.hash is distinct from jornada.calcular_hash_evento(
      v_evento.hash_prev,
      v_evento.tenant_id,
      v_evento.trabajador_id,
      v_evento.tipo,
      v_evento.ts_servidor,
      v_evento.ts_dispositivo,
      v_evento.origen,
      v_evento.lat,
      v_evento.lng,
      v_evento.foto_hash,
      v_evento.creado_por
    ) then
      return query select false, v_n, v_evento.id, v_evento.ts_servidor,
        'el hash no corresponde al contenido del evento'::text;
      return;
    end if;

    v_prev_hash := v_evento.hash;
  end loop;

  return query select true, v_n, null::uuid, null::timestamptz, null::text;
end;
$$;

comment on function jornada.verificar_cadena(uuid, uuid, timestamptz, timestamptz)
  is 'Verifica la cadena de hashes de un trabajador: íntegra o no, y el primer punto de ruptura.';
