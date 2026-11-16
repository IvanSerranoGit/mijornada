-- Dominio jornada: evento (bitácora, particionada por mes), dia_laboral y sello_diario.
-- El trigger de inmutabilidad y el hash encadenado llegan en la migración siguiente.

create table jornada.evento (
  id uuid not null default public.uuid_v7(),
  tenant_id uuid not null,
  trabajador_id uuid not null,
  tipo text not null check (
    tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa', 'correccion', 'aprobacion', 'anulacion')
  ),
  ts_servidor timestamptz not null default now(),
  ts_dispositivo timestamptz,
  origen text not null check (
    origen in ('pwa', 'kiosco', 'api', 'import', 'incidencia', 'sincronizacion_tardia')
  ),
  dispositivo_id text,
  client_event_id uuid,
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  precision_m numeric(8, 2) check (precision_m >= 0),
  foto_url text,
  foto_hash text check (foto_hash ~ '^[0-9a-f]{64}$'),
  hash_prev text check (hash_prev ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid not null references tenants.usuario (id),
  motivo text,
  referencia_evento_id uuid,
  -- La llave de partición debe formar parte de la llave primaria.
  primary key (id, ts_servidor),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  -- Una corrección o anulación siempre apunta al evento original y explica por qué.
  check (tipo not in ('correccion', 'anulacion') or (referencia_evento_id is not null and motivo is not null))
) partition by range (ts_servidor);

comment on table jornada.evento is 'Bitácora de jornada, append-only. Nunca UPDATE ni DELETE: toda corrección es un evento nuevo que referencia al original.';
comment on column jornada.evento.ts_servidor is 'Hora oficial en UTC, fijada por el servidor al recibir el evento.';
comment on column jornada.evento.ts_dispositivo is 'Hora que reportó el dispositivo, tal cual; sirve para detectar desfases y marcas diferidas.';
comment on column jornada.evento.origen is 'sincronizacion_tardia: llegó más de 24 h después de ts_dispositivo. incidencia: generado al aprobar una incidencia.';
comment on column jornada.evento.client_event_id is 'Identificador generado por el cliente para sincronización idempotente.';
comment on column jornada.evento.foto_hash is 'SHA-256 de la foto del marcaje; la foto se purga a los 90 días y el hash permanece.';
comment on column jornada.evento.hash_prev is 'Hash del evento anterior del mismo trabajador; null en el primero de la cadena.';
comment on column jornada.evento.hash is 'SHA-256 encadenado del evento (ver CLAUDE.md).';
comment on column jornada.evento.referencia_evento_id is 'Evento original al que apunta una corrección, aprobación o anulación. Sin llave foránea porque la tabla está particionada; lo valida el trigger de inserción.';

create index evento_trabajador_ts_idx on jornada.evento (tenant_id, trabajador_id, ts_servidor);
create index evento_tenant_ts_idx on jornada.evento (tenant_id, ts_servidor);
create index evento_client_event_idx on jornada.evento (trabajador_id, client_event_id)
  where client_event_id is not null;
create index evento_referencia_idx on jornada.evento (referencia_evento_id)
  where referencia_evento_id is not null;

-- Particiones mensuales (límites en UTC): jornada.evento_AAAA_MM.
create function jornada.crear_particion_evento(p_mes date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nombre text := 'evento_' || to_char(v_inicio, 'YYYY_MM');
begin
  execute format(
    'create table if not exists jornada.%I partition of jornada.evento for values from (%L) to (%L)',
    v_nombre,
    v_inicio::text || ' 00:00:00+00',
    v_fin::text || ' 00:00:00+00'
  );
  return v_nombre;
end;
$$;

comment on function jornada.crear_particion_evento(date) is 'Crea, si no existe, la partición mensual de jornada.evento que contiene la fecha dada.';

create function jornada.asegurar_particiones_evento(p_meses_adelante integer default 3)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_mes_actual date := date_trunc('month', now() at time zone 'utc')::date;
begin
  for i in 0..p_meses_adelante loop
    perform jornada.crear_particion_evento((v_mes_actual + make_interval(months => i))::date);
  end loop;
end;
$$;

comment on function jornada.asegurar_particiones_evento(integer) is 'Garantiza que existan las particiones del mes actual y de los meses siguientes.';

revoke all on function jornada.crear_particion_evento(date) from public;
revoke all on function jornada.asegurar_particiones_evento(integer) from public;

-- Particiones iniciales (mes actual y los 12 siguientes) y job diario que las mantiene.
select jornada.asegurar_particiones_evento(12);

select cron.schedule(
  'jornada-particiones-evento',
  '15 0 * * *',
  $$select jornada.asegurar_particiones_evento(3)$$
);

-- Día laboral: tabla derivada de jornada.evento, reconstruible desde cero.
-- Es tabla y no vista materializada porque estas no admiten RLS.
create table jornada.dia_laboral (
  tenant_id uuid not null,
  trabajador_id uuid not null,
  fecha date not null,
  entrada timestamptz,
  salida timestamptz,
  pausas_min integer not null default 0 check (pausas_min >= 0),
  minutos_trabajados integer not null default 0 check (minutos_trabajados >= 0),
  estado text not null check (estado in ('completo', 'incompleto', 'corregido')),
  recalculado_en timestamptz not null default now(),
  primary key (tenant_id, trabajador_id, fecha),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id)
);

comment on table jornada.dia_laboral is 'Derivada de jornada.evento; se puede borrar y recalcular. La fecha es el día en la zona horaria del centro.';

create index dia_laboral_fecha_idx on jornada.dia_laboral (tenant_id, fecha);

-- Sello diario: raíz Merkle de los eventos del día por tenant.
create table jornada.sello_diario (
  tenant_id uuid not null references tenants.empresa (id),
  fecha date not null,
  hash_raiz text not null check (hash_raiz ~ '^[0-9a-f]{64}$'),
  n_eventos integer not null check (n_eventos >= 0),
  sellado_en timestamptz not null default now(),
  proveedor_sello text,
  primary key (tenant_id, fecha)
);

comment on table jornada.sello_diario is 'Cierre criptográfico del día por tenant. La fecha es el día en la zona horaria del tenant.';
comment on column jornada.sello_diario.proveedor_sello is 'Prestador que emitió la constancia NOM-151 del sello, si el tenant la activó.';
