-- Hora declarada de las correcciones y conformidad del trabajador.
-- Decisión provisional mientras responde el abogado (docs/preguntas-abogado.md, pregunta 9).
--
--   * jornada.evento.ts_declarado: la hora en que se afirma que ocurrió la entrada o
--     la salida. ts_servidor sigue siendo cuándo se registró. Obligatoria en una
--     corrección; también la llevan los marcajes que nacen de una incidencia.
--   * El día laboral usa ts_declarado cuando existe.
--   * La conformidad del trabajador queda en cumplimiento.incidencia (aceptada_por,
--     aceptada_en). Sin ella, el reporte debe decir "sin conformidad del trabajador".
--
-- VERSIÓN DEL HASH
--   v1 (eventos anteriores a esta migración), once campos unidos con "|":
--     hash_prev | tenant_id | trabajador_id | tipo | ts_servidor | ts_dispositivo |
--     origen | lat | lng | foto_hash | creado_por
--   v2 (eventos nuevos): el prefijo "v2", los once campos de v1 y ts_declarado:
--     v2 | hash_prev | tenant_id | trabajador_id | tipo | ts_servidor | ts_dispositivo |
--     origen | lat | lng | foto_hash | creado_por | ts_declarado
--   Mismas reglas de forma: UTF-8, nulo = cadena vacía, horas en UTC con
--   microsegundos, coordenadas con seis decimales. La versión de cada evento queda
--   en jornada.evento.hash_version y la verificación usa la que corresponde.

alter table jornada.evento
  add column ts_declarado timestamptz,
  add column hash_version smallint not null default 1 check (hash_version in (1, 2)),
  add constraint evento_correccion_declara_hora check (tipo <> 'correccion' or ts_declarado is not null);

comment on column jornada.evento.ts_declarado is 'Hora en que se afirma que ocurrió el marcaje (correcciones y marcajes por incidencia). ts_servidor es cuándo se registró.';
comment on column jornada.evento.hash_version is 'Versión de la fórmula canónica del hash: 1 sin ts_declarado, 2 con ts_declarado.';

create function jornada.calcular_hash_evento_v2(
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
  p_ts_declarado timestamptz
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
            'v2',
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
            coalesce(to_char(p_ts_declarado at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '')
          ],
          '|'
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

comment on function jornada.calcular_hash_evento_v2(text, uuid, uuid, text, timestamptz, timestamptz, text, numeric, numeric, text, uuid, timestamptz)
  is 'SHA-256 encadenado de un evento, versión 2 (incluye ts_declarado).';

-- Hash de un evento ya guardado, con la versión que le corresponde.
create function jornada.hash_de_evento(p_evento jornada.evento)
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
    else jornada.calcular_hash_evento_v2(
      p_evento.hash_prev, p_evento.tenant_id, p_evento.trabajador_id, p_evento.tipo, p_evento.ts_servidor,
      p_evento.ts_dispositivo, p_evento.origen, p_evento.lat, p_evento.lng, p_evento.foto_hash, p_evento.creado_por,
      p_evento.ts_declarado
    )
  end;
$$;

-- Inserción: igual que antes, pero los eventos nuevos se encadenan con la versión 2.
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
  new.hash_version := 2;
  new.hash := jornada.hash_de_evento(new);
  return new;
end;
$$;

-- Verificación: cada evento se comprueba con la versión de hash con la que se creó.
create or replace function jornada.verificar_cadena(
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
  v_evento jornada.evento;
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

    if v_evento.hash is distinct from jornada.hash_de_evento(v_evento) then
      return query select false, v_n, v_evento.id, v_evento.ts_servidor,
        'el hash no corresponde al contenido del evento'::text;
      return;
    end if;

    v_prev_hash := v_evento.hash;
  end loop;

  return query select true, v_n, null::uuid, null::timestamptz, null::text;
end;
$$;

-- Los clientes no declaran horas: solo el servidor, al resolver una incidencia.
drop policy evento_marcaje on jornada.evento;

create policy evento_marcaje on jornada.evento for insert to authenticated
  with check (
    tenant_id = tenants.jwt_tenant_id()
    and creado_por = tenants.jwt_usuario_id()
    and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
    and referencia_evento_id is null
    and ts_declarado is null
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

-- ---------------------------------------------------------------- día laboral

-- Hora que cuenta de un marcaje: la declarada, si no la del dispositivo, si no la del servidor.
create function jornada.hora_efectiva(p_ts_servidor timestamptz, p_ts_dispositivo timestamptz, p_ts_declarado timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select coalesce(p_ts_declarado, p_ts_dispositivo, p_ts_servidor); $$;

-- Marcajes vigentes con su hora efectiva. Si un marcaje tiene correcciones, vale
-- la hora declarada por la más reciente.
create or replace function jornada.marcajes_vigentes(
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
  select m.id, m.tipo, m.hora, m.corregido
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
      ) or e.origen = 'incidencia' as corregido
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

-- Al insertar: se recalculan los días afectados. Una corrección afecta al día del
-- marcaje original y al día de la hora declarada.
create or replace function jornada.recalcular_dia_por_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text;
  v_horas timestamptz[] := array[jornada.hora_efectiva(new.ts_servidor, new.ts_dispositivo, new.ts_declarado)];
  v_hora timestamptz;
  v_fecha date;
begin
  select c.zona_horaria
  into v_zona
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = new.trabajador_id;

  if new.referencia_evento_id is not null then
    select jornada.hora_efectiva(o.ts_servidor, o.ts_dispositivo, o.ts_declarado)
    into v_hora
    from jornada.evento o
    where o.id = new.referencia_evento_id;
    v_horas := v_horas || v_hora;
  end if;

  for v_fecha in
    select distinct (h at time zone v_zona)::date from unnest(v_horas) as h where h is not null
  loop
    perform jornada.recalcular_dia(new.tenant_id, new.trabajador_id, v_fecha - 1);
    perform jornada.recalcular_dia(new.tenant_id, new.trabajador_id, v_fecha);
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------- incidencias

alter table cumplimiento.incidencia
  add column evento_referido_id uuid,
  add column tipo_marcaje text check (tipo_marcaje in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')),
  add column ts_declarado timestamptz,
  add column aceptada_por uuid references tenants.usuario (id),
  add column aceptada_en timestamptz,
  drop constraint incidencia_tipo_check,
  add constraint incidencia_tipo_check
    check (tipo in ('olvido', 'correccion_hora', 'permiso', 'home_office', 'falta_justificada')),
  add constraint incidencia_aceptacion_check check ((aceptada_por is null) = (aceptada_en is null)),
  -- Olvido: falta un marcaje; se dice cuál y a qué hora fue.
  add constraint incidencia_olvido_check
    check (tipo <> 'olvido' or (tipo_marcaje is not null and ts_declarado is not null)),
  -- Corrección de hora: se señala el marcaje equivocado y la hora correcta.
  add constraint incidencia_correccion_check
    check (tipo <> 'correccion_hora' or (evento_referido_id is not null and ts_declarado is not null));

comment on column cumplimiento.incidencia.evento_referido_id is 'Marcaje que se pide corregir (correccion_hora).';
comment on column cumplimiento.incidencia.tipo_marcaje is 'Marcaje que faltó (olvido): entrada, salida, inicio o fin de pausa.';
comment on column cumplimiento.incidencia.ts_declarado is 'Hora en que se afirma que ocurrió el marcaje.';
comment on column cumplimiento.incidencia.aceptada_por is 'Usuario del trabajador que dio su conformidad. Null: sin conformidad del trabajador.';
comment on column cumplimiento.incidencia.aceptada_en is 'Cuándo dio su conformidad el trabajador.';

-- La conformidad nunca la escribe el cliente: si la incidencia la abre el propio
-- trabajador, nace aceptada por él; si la abre el patrón, queda pendiente de aceptar.
create function cumplimiento.fijar_conformidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from tenants.usuario u
    where u.id = new.solicitado_por and u.trabajador_id = new.trabajador_id
  ) then
    new.aceptada_por := new.solicitado_por;
    new.aceptada_en := now();
  else
    new.aceptada_por := null;
    new.aceptada_en := null;
  end if;
  return new;
end;
$$;

create trigger incidencia_fija_conformidad
  before insert on cumplimiento.incidencia
  for each row execute function cumplimiento.fijar_conformidad();

-- El trabajador da su conformidad a una incidencia que abrió el patrón.
create function cumplimiento.aceptar_incidencia(p_incidencia_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incidencia cumplimiento.incidencia;
begin
  select i.* into v_incidencia from cumplimiento.incidencia i where i.id = p_incidencia_id for update;
  if v_incidencia.id is null
     or tenants.jwt_rol() is distinct from 'empleado'
     or v_incidencia.tenant_id is distinct from tenants.jwt_tenant_id()
     or v_incidencia.trabajador_id is distinct from tenants.jwt_trabajador_id() then
    raise exception 'Solo el propio trabajador puede dar su conformidad.' using errcode = 'insufficient_privilege';
  end if;

  if v_incidencia.aceptada_en is null then
    update cumplimiento.incidencia i
    set aceptada_por = tenants.jwt_usuario_id(), aceptada_en = now()
    where i.id = p_incidencia_id
    returning i.aceptada_en into v_incidencia.aceptada_en;
  end if;
  return v_incidencia.aceptada_en;
end;
$$;

-- Resuelve una incidencia. Al aprobar, el sistema inserta el evento que corresponde:
--   correccion_hora -> evento "correccion" que apunta al marcaje original
--   olvido          -> el marcaje que faltó, con origen "incidencia"
--   los demás       -> evento "aprobacion"
-- En todos los casos con el motivo, quién aprobó y la hora declarada.
create function cumplimiento.resolver_incidencia(p_incidencia_id uuid, p_aprobar boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incidencia cumplimiento.incidencia;
  v_usuario_id uuid := tenants.jwt_usuario_id();
  v_evento_id uuid;
begin
  select i.* into v_incidencia from cumplimiento.incidencia i where i.id = p_incidencia_id for update;
  if v_incidencia.id is null or v_usuario_id is null or not (
    tenants.es_admin_de(v_incidencia.tenant_id)
    or tenants.es_supervisor_de_centro(v_incidencia.tenant_id, tenants.centro_de_trabajador(v_incidencia.trabajador_id))
  ) then
    raise exception 'La incidencia no existe o no puedes resolverla.' using errcode = 'insufficient_privilege';
  end if;
  if v_incidencia.estado <> 'pendiente' then
    raise exception 'La incidencia ya fue resuelta.' using errcode = 'check_violation';
  end if;

  if p_aprobar then
    insert into jornada.evento
      (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id, ts_declarado)
    values (
      v_incidencia.tenant_id,
      v_incidencia.trabajador_id,
      case v_incidencia.tipo
        when 'correccion_hora' then 'correccion'
        when 'olvido' then v_incidencia.tipo_marcaje
        else 'aprobacion'
      end,
      'incidencia',
      v_usuario_id,
      v_incidencia.motivo,
      case when v_incidencia.tipo = 'correccion_hora' then v_incidencia.evento_referido_id end,
      case when v_incidencia.tipo in ('correccion_hora', 'olvido') then v_incidencia.ts_declarado end
    )
    returning id into v_evento_id;
  end if;

  update cumplimiento.incidencia i
  set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      resuelto_por = v_usuario_id,
      resuelto_en = now(),
      evento_resultante_id = v_evento_id
  where i.id = p_incidencia_id;

  return v_evento_id;
end;
$$;

comment on function cumplimiento.resolver_incidencia(uuid, boolean)
  is 'Aprueba o rechaza una incidencia. Al aprobar inserta el evento de jornada que corresponde y devuelve su id.';

revoke all on function cumplimiento.aceptar_incidencia(uuid) from public;
revoke all on function cumplimiento.resolver_incidencia(uuid, boolean) from public;
grant execute on function cumplimiento.aceptar_incidencia(uuid) to authenticated;
grant execute on function cumplimiento.resolver_incidencia(uuid, boolean) to authenticated;

-- La resolución pasa por la función (inserta el evento); el cliente ya no cambia el estado directo.
revoke update (estado, resuelto_por, resuelto_en) on cumplimiento.incidencia from authenticated;
drop policy incidencia_resolucion on cumplimiento.incidencia;
