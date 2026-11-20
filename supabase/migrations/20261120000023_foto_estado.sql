-- Estado de la foto del marcaje (foto_estado) y versión 3 del hash.
--
-- La foto nunca bloquea un marcaje. Para que el día laboral y el reporte puedan
-- decir "foto no disponible" en vez de mostrar una foto faltante sin explicación,
-- cada evento guarda qué pasó con su foto:
--
--   ok            hay foto (foto_hash presente)
--   no_disponible fallo técnico al tomarla o guardarla; foto_motivo dice cuál (corto)
--   sin_camara    el dispositivo no tiene cámara o no dio permiso de usarla
--   no_requerida  el centro no pide foto para ese medio, o el evento no es un marcaje
--
-- El estado lo fija el servidor al insertar: con foto_hash siempre es "ok"; sin él
-- se acepta "sin_camara" o "no_disponible" si el dispositivo lo declara; si no
-- declara nada y el centro pide foto, queda "no_disponible"; si no la pide,
-- "no_requerida".
--
-- VERSIÓN DEL HASH
--   v3 (eventos nuevos): el prefijo "v3", los once campos de v1, ts_declarado,
--   foto_estado y foto_motivo:
--     v3 | hash_prev | tenant_id | trabajador_id | tipo | ts_servidor | ts_dispositivo |
--     origen | lat | lng | foto_hash | creado_por | ts_declarado | foto_estado | foto_motivo
--   Mismas reglas de forma que v1 y v2. Los eventos anteriores conservan su versión
--   (1 o 2) y foto_estado nulo; la verificación usa la versión de cada evento.

alter table jornada.evento
  add column foto_estado text check (foto_estado in ('ok', 'no_disponible', 'sin_camara', 'no_requerida')),
  add column foto_motivo text check (char_length(foto_motivo) <= 120),
  drop constraint evento_hash_version_check,
  add constraint evento_hash_version_check check (hash_version in (1, 2, 3)),
  add constraint evento_foto_estado_v3 check (hash_version < 3 or foto_estado is not null),
  add constraint evento_foto_ok_con_hash check (foto_estado is null or (foto_estado = 'ok') = (foto_hash is not null)),
  add constraint evento_foto_motivo check (foto_motivo is null or foto_estado = 'no_disponible');

comment on column jornada.evento.foto_estado is 'Qué pasó con la foto del marcaje: ok, no_disponible, sin_camara o no_requerida. Nulo en eventos anteriores a la versión 3 del hash.';
comment on column jornada.evento.foto_motivo is 'Motivo técnico corto cuando foto_estado es no_disponible.';
comment on column jornada.evento.hash_version is 'Versión de la fórmula canónica del hash: 1 original, 2 con ts_declarado, 3 con foto_estado y foto_motivo.';

create function jornada.calcular_hash_evento_v3(
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
  p_creado_por uuid,
  p_ts_declarado timestamptz,
  p_foto_estado text,
  p_foto_motivo text
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
            'v3',
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
            p_creado_por::text,
            coalesce(to_char(p_ts_declarado at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
            coalesce(p_foto_estado, ''),
            coalesce(p_foto_motivo, '')
          ],
          '|'
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

comment on function jornada.calcular_hash_evento_v3(text, uuid, uuid, text, timestamptz, timestamptz, text, numeric, numeric, text, uuid, timestamptz, text, text)
  is 'SHA-256 encadenado de un evento, versión 3 (incluye ts_declarado, foto_estado y foto_motivo).';

-- Hash de un evento ya guardado, con la versión que le corresponde.
create or replace function jornada.hash_de_evento(p_evento jornada.evento)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_evento.hash_version
    when 1 then jornada.calcular_hash_evento(
      p_evento.hash_prev, p_evento.tenant_id, p_evento.trabajador_id, p_evento.tipo, p_evento.ts_servidor,
      p_evento.ts_dispositivo, p_evento.origen, p_evento.lat, p_evento.lng, p_evento.foto_hash, p_evento.creado_por
    )
    when 2 then jornada.calcular_hash_evento_v2(
      p_evento.hash_prev, p_evento.tenant_id, p_evento.trabajador_id, p_evento.tipo, p_evento.ts_servidor,
      p_evento.ts_dispositivo, p_evento.origen, p_evento.lat, p_evento.lng, p_evento.foto_hash, p_evento.creado_por,
      p_evento.ts_declarado
    )
    else jornada.calcular_hash_evento_v3(
      p_evento.hash_prev, p_evento.tenant_id, p_evento.trabajador_id, p_evento.tipo, p_evento.ts_servidor,
      p_evento.ts_dispositivo, p_evento.origen, p_evento.lat, p_evento.lng, p_evento.foto_hash, p_evento.creado_por,
      p_evento.ts_declarado, p_evento.foto_estado, p_evento.foto_motivo
    )
  end;
$$;

-- Inserción: igual que antes, más el estado de la foto; los eventos nuevos se
-- encadenan con la versión 3.
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
  v_origen text := new.origen;
  v_foto_requerida boolean;
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

  -- Estado de la foto: lo decide el servidor a partir de lo que llegó.
  if new.foto_hash is not null then
    new.foto_estado := 'ok';
    new.foto_motivo := null;
  elsif new.foto_estado = 'sin_camara' then
    new.foto_motivo := null;
  elsif new.foto_estado = 'no_disponible' then
    new.foto_motivo := left(coalesce(nullif(btrim(new.foto_motivo), ''), 'sin detalle'), 120);
  else
    -- El dispositivo no dijo nada (o dijo "ok" sin foto): depende de si el centro la pide.
    select case v_origen when 'kiosco' then c.foto_en_kiosco when 'pwa' then c.foto_en_telefono else false end
    into v_foto_requerida
    from tenants.trabajador t
    join tenants.centro_trabajo c on c.id = t.centro_id
    where t.id = new.trabajador_id;

    if new.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa') and coalesce(v_foto_requerida, false) then
      new.foto_estado := 'no_disponible';
      new.foto_motivo := 'el dispositivo no informó el motivo';
    else
      new.foto_estado := 'no_requerida';
      new.foto_motivo := null;
    end if;
  end if;

  new.hash_prev := v_prev_hash;
  new.hash_version := 3;
  new.hash := jornada.hash_de_evento(new);
  return new;
end;
$$;

-- ---------------------------------------------------------------- día laboral

alter table jornada.dia_laboral
  add column fotos_no_disponibles integer not null default 0 check (fotos_no_disponibles >= 0);

comment on column jornada.dia_laboral.fotos_no_disponibles is 'Marcajes del día sin foto por fallo técnico o por falta de cámara (foto_estado no_disponible o sin_camara).';

-- Cambia el tipo de retorno (agrega foto_estado): hay que borrarla y crearla de nuevo.
drop function jornada.marcajes_vigentes(uuid, uuid, timestamptz, timestamptz);

create function jornada.marcajes_vigentes(
  p_tenant_id uuid,
  p_trabajador_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (id uuid, tipo text, hora timestamptz, corregido boolean, foto_estado text)
language sql
stable
set search_path = ''
as $$
  select m.id, m.tipo, m.hora, m.corregido, m.foto_estado
  from (
    select
      e.id,
      e.tipo,
      coalesce(
        (
          select c.ts_declarado
          from jornada.evento c
          where c.referencia_evento_id = e.id and c.tipo = 'correccion'
          order by c.ts_servidor desc, c.id desc
          limit 1
        ),
        jornada.hora_efectiva(e.ts_servidor, e.ts_dispositivo, e.ts_declarado)
      ) as hora,
      exists (
        select 1 from jornada.evento c
        where c.referencia_evento_id = e.id and c.tipo = 'correccion'
      ) or e.origen = 'incidencia' as corregido,
      e.foto_estado
    from jornada.evento e
    where e.tenant_id = p_tenant_id
      and e.trabajador_id = p_trabajador_id
      and e.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
      and not exists (
        select 1 from jornada.evento a
        where a.referencia_evento_id = e.id and a.tipo = 'anulacion'
      )
  ) m
  where m.hora >= p_desde and m.hora < p_hasta;
$$;

revoke all on function jornada.marcajes_vigentes(uuid, uuid, timestamptz, timestamptz) from public;

-- Igual que antes, y además cuenta los marcajes del día cuya foto no está disponible.
create or replace function jornada.recalcular_dia(p_tenant_id uuid, p_trabajador_id uuid, p_fecha date)
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
  v_fotos_no_disponibles integer := 0;
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
    if v_evento.foto_estado in ('no_disponible', 'sin_camara') then
      v_fotos_no_disponibles := v_fotos_no_disponibles + 1;
    end if;

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
    (tenant_id, trabajador_id, fecha, entrada, salida, pausas_min, minutos_trabajados, estado, fotos_no_disponibles, recalculado_en)
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
    v_fotos_no_disponibles,
    now()
  )
  on conflict (tenant_id, trabajador_id, fecha) do update
  set entrada = excluded.entrada,
      salida = excluded.salida,
      pausas_min = excluded.pausas_min,
      minutos_trabajados = excluded.minutos_trabajados,
      estado = excluded.estado,
      fotos_no_disponibles = excluded.fotos_no_disponibles,
      recalculado_en = excluded.recalculado_en;
end;
$$;

-- ---------------------------------------------------------------- kiosco

alter table tenants.dispositivo add column camara_disponible boolean;

comment on column tenants.dispositivo.camara_disponible is 'Lo que dijo el último marcaje del kiosco sobre su cámara: true con foto, false sin cámara, nulo si aún no se sabe.';

grant select (camara_disponible) on tenants.dispositivo to authenticated;

-- Se agregan p_foto_estado y p_foto_motivo: el kiosco declara "sin_camara" o
-- "no_disponible" cuando el centro pide foto y no pudo tomarla.
drop function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text);

create function jornada.kiosco_marcar(
  p_token text,
  p_client_event_id uuid,
  p_ts_dispositivo timestamptz,
  p_pin text default null,
  p_qr text default null,
  p_foto_hash text default null,
  p_foto_estado text default null,
  p_foto_motivo text default null
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
    (tenant_id, trabajador_id, tipo, origen, creado_por, client_event_id, ts_dispositivo, foto_hash, dispositivo_id,
     foto_estado, foto_motivo)
  values
    (v_dispositivo.tenant_id, v_trabajador.id, v_tipo, 'kiosco', v_dispositivo.usuario_id, p_client_event_id,
     p_ts_dispositivo, p_foto_hash, v_dispositivo.id::text, p_foto_estado, p_foto_motivo)
  returning * into v_evento;

  -- Lo que este marcaje dice de la cámara de la tablet, para avisar en el panel.
  if v_evento.foto_estado in ('ok', 'sin_camara') then
    update tenants.dispositivo d
    set camara_disponible = (v_evento.foto_estado = 'ok')
    where d.id = v_dispositivo.id
      and d.camara_disponible is distinct from (v_evento.foto_estado = 'ok');
  end if;

  return query select v_evento.id, false, v_trabajador.id, v_trabajador.nombre, v_evento.tipo,
    v_evento.ts_servidor, v_evento.foto_url;
end;
$$;

comment on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text, text, text)
  is 'Marcaje desde un kiosco vinculado: identifica por PIN o QR, decide entrada o salida e inserta el evento.';

revoke all on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text, text, text) from public;
grant execute on function jornada.kiosco_marcar(text, uuid, timestamptz, text, text, text, text, text) to anon, authenticated, service_role;
