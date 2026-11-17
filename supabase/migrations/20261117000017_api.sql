-- Sprint 2, fase 2: apoyo en la base para la API /api/v1.

-- ---------------------------------------------------------------- horarios

-- Un horario nunca se sobreescribe: crear uno cierra el vigente el día anterior
-- y abre una versión nueva, en una sola transacción.
create function tenants.crear_horario(
  trabajador_id uuid,
  vigente_desde date,
  dias jsonb,
  hora_entrada time,
  hora_salida time,
  descanso_semanal smallint[] default '{7}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  select t.tenant_id into v_tenant_id from tenants.trabajador t where t.id = crear_horario.trabajador_id;
  if v_tenant_id is null or not tenants.es_admin_de(v_tenant_id) then
    raise exception 'El trabajador no existe o no puedes administrarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from tenants.horario h
    where h.trabajador_id = crear_horario.trabajador_id
      and h.vigente_desde >= crear_horario.vigente_desde
  ) then
    raise exception 'Ya existe un horario que empieza el % o después.', crear_horario.vigente_desde
      using errcode = 'exclusion_violation';
  end if;

  update tenants.horario h
  set vigente_hasta = crear_horario.vigente_desde - 1
  where h.trabajador_id = crear_horario.trabajador_id
    and (h.vigente_hasta is null or h.vigente_hasta >= crear_horario.vigente_desde);

  insert into tenants.horario (tenant_id, trabajador_id, vigente_desde, dias, hora_entrada, hora_salida, descanso_semanal)
  values (
    v_tenant_id,
    crear_horario.trabajador_id,
    crear_horario.vigente_desde,
    crear_horario.dias,
    crear_horario.hora_entrada,
    crear_horario.hora_salida,
    coalesce(crear_horario.descanso_semanal, '{7}')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function tenants.crear_horario(uuid, date, jsonb, time, time, smallint[])
  is 'Crea una versión nueva del horario del trabajador y cierra la anterior.';

revoke all on function tenants.crear_horario(uuid, date, jsonb, time, time, smallint[]) from public;
grant execute on function tenants.crear_horario(uuid, date, jsonb, time, time, smallint[]) to authenticated;

-- ---------------------------------------------------------------- límite de peticiones

-- Rate limit por tenant con ventana fija, sin dependencias externas.
create table tenants.limite_api (
  tenant_id uuid not null references tenants.empresa (id),
  ventana timestamptz not null,
  peticiones integer not null default 0,
  primary key (tenant_id, ventana)
);

comment on table tenants.limite_api is 'Contador de peticiones a la API por tenant y ventana de tiempo.';

alter table tenants.limite_api enable row level security;
grant select, insert, update, delete on tenants.limite_api to service_role;

-- Cuenta una petición del tenant del JWT. Devuelve false si ya rebasó el máximo
-- de la ventana actual. Sin tenant en el JWT no limita (lo hará quien autentica).
create function tenants.consumir_limite_api(p_max integer default 600, p_ventana_seg integer default 60)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := tenants.jwt_tenant_id();
  v_ventana timestamptz;
  v_peticiones integer;
begin
  if v_tenant_id is null then
    return true;
  end if;

  v_ventana := to_timestamp(floor(extract(epoch from now()) / p_ventana_seg) * p_ventana_seg);

  insert into tenants.limite_api as l (tenant_id, ventana, peticiones)
  values (v_tenant_id, v_ventana, 1)
  on conflict (tenant_id, ventana) do update set peticiones = l.peticiones + 1
  returning l.peticiones into v_peticiones;

  return v_peticiones <= p_max;
end;
$$;

revoke all on function tenants.consumir_limite_api(integer, integer) from public;
grant execute on function tenants.consumir_limite_api(integer, integer) to authenticated;

-- Limpieza diaria de ventanas viejas.
select cron.schedule(
  'tenants-limite-api-limpieza',
  '30 3 * * *',
  $$delete from tenants.limite_api where ventana < now() - interval '1 day'$$
);
