-- Dominio calculo: regla (con vigencia) y resumen_periodo (derivada).

-- Las reglas son globales (no llevan tenant_id): solo Inzotec las escribe.
create table calculo.regla (
  id uuid primary key default public.uuid_v7(),
  clave text not null check (clave ~ '^[a-z][a-z0-9_]*$'),
  valor numeric not null,
  unidad text not null,
  vigente_desde date not null,
  vigente_hasta date,
  fuente text not null,
  creado_en timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- Una clave no puede tener dos valores vigentes el mismo día.
  exclude using gist (
    clave with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  )
);

comment on table calculo.regla is 'Reglas legales con vigencia (jornada máxima, topes de horas extra, UMA). Nunca se codifican como constantes.';
comment on column calculo.regla.vigente_hasta is 'Último día de vigencia (inclusivo); null significa vigente a la fecha.';

-- Valor de una regla en una fecha; null si no hay regla vigente ese día.
create function calculo.regla_vigente(p_clave text, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select valor
  from calculo.regla
  where clave = p_clave
    and vigente_desde <= p_fecha
    and (vigente_hasta is null or vigente_hasta >= p_fecha);
$$;

comment on function calculo.regla_vigente(text, date) is 'Devuelve el valor de la regla vigente en la fecha dada, o null si no existe.';

-- Resumen por periodo: derivada de jornada.evento, insumo para nómina y reportes.
create table calculo.resumen_periodo (
  tenant_id uuid not null,
  trabajador_id uuid not null,
  periodo_inicio date not null,
  periodo_fin date not null,
  horas_ordinarias numeric(7, 2) not null default 0 check (horas_ordinarias >= 0),
  extra_dobles numeric(7, 2) not null default 0 check (extra_dobles >= 0),
  extra_triples numeric(7, 2) not null default 0 check (extra_triples >= 0),
  alertas jsonb not null default '[]'::jsonb check (jsonb_typeof(alertas) = 'array'),
  recalculado_en timestamptz not null default now(),
  primary key (tenant_id, trabajador_id, periodo_inicio, periodo_fin),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  check (periodo_fin >= periodo_inicio)
);

comment on table calculo.resumen_periodo is 'Derivada de jornada.evento; se puede borrar y recalcular si cambian las reglas.';
