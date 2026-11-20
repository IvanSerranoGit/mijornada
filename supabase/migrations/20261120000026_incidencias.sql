-- Sprint 3, fase 2: incidencias y correcciones con rastro completo.
--
--   * El trabajador puede manifestar su conformidad o su inconformidad (con comentario)
--     con una incidencia que abrió el patrón. La respuesta se da una sola vez y queda
--     asentada; no cambia la resolución.
--   * Una incidencia abierta más de `dias_para_reportar_incidencia` días hábiles después
--     de su fecha queda marcada como extemporánea. No se bloquea: es un aviso para el
--     panel y para el reporte. El plazo vive en calculo.regla (hoy 5; pregunta 9 del
--     abogado puede cambiarlo).
--   * jornada.detalle_marcajes entrega cada marcaje con su hora original, su corrección
--     (hora declarada, motivo, quién autorizó, cuándo) y la conformidad del trabajador:
--     es la fuente de la vista del día y del reporte para inspección.

alter table tenants.usuario add column nombre text check (nombre is null or length(btrim(nombre)) > 0);

comment on column tenants.usuario.nombre is 'Nombre para mostrar de administradores y supervisores. Los trabajadores usan el de tenants.trabajador.';

-- Nombre para mostrar de un usuario del tenant: el suyo, el del trabajador o su correo.
create function tenants.nombre_de_usuario(p_usuario_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.nombre, t.nombre, a.email::text)
  from tenants.usuario u
  left join tenants.trabajador t on t.id = u.trabajador_id
  left join auth.users a on a.id = u.auth_user_id
  where u.id = p_usuario_id
    and (auth.uid() is null or u.tenant_id = tenants.jwt_tenant_id());
$$;

revoke all on function tenants.nombre_de_usuario(uuid) from public;
grant execute on function tenants.nombre_de_usuario(uuid) to authenticated, service_role;

alter table cumplimiento.incidencia
  add column inconforme_en timestamptz,
  add column comentario_trabajador text check (comentario_trabajador is null or length(btrim(comentario_trabajador)) > 0),
  add column extemporanea boolean not null default false,
  add constraint incidencia_respuesta_unica check (aceptada_en is null or inconforme_en is null),
  add constraint incidencia_inconformidad_con_comentario check (inconforme_en is null or comentario_trabajador is not null);

comment on column cumplimiento.incidencia.inconforme_en is 'Cuándo manifestó el trabajador su inconformidad.';
comment on column cumplimiento.incidencia.comentario_trabajador is 'Comentario del trabajador al responder la incidencia (obligatorio si está inconforme).';
comment on column cumplimiento.incidencia.extemporanea is 'Se abrió después del plazo de calculo.regla dias_para_reportar_incidencia. Es un aviso; no bloquea.';

-- Días hábiles (lunes a viernes) que van de una fecha a otra, sin contar la primera.
create function calculo.dias_habiles_entre(p_desde date, p_hasta date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_desde + 1, p_hasta, interval '1 day') as d
  where extract(isodow from d) < 6;
$$;

comment on function calculo.dias_habiles_entre(date, date)
  is 'Días hábiles (lunes a viernes, sin festivos) posteriores a p_desde y hasta p_hasta.';

-- Al abrir: se asienta si la incidencia llega fuera del plazo. La fecha de hoy es la del centro.
create function cumplimiento.marcar_extemporanea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date;
  v_plazo numeric;
begin
  select (now() at time zone c.zona_horaria)::date
  into v_hoy
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = new.trabajador_id;

  v_plazo := calculo.regla_vigente('dias_para_reportar_incidencia', v_hoy);
  new.extemporanea := v_plazo is not null and calculo.dias_habiles_entre(new.fecha, v_hoy) > v_plazo;
  new.inconforme_en := null;
  new.comentario_trabajador := null;
  return new;
end;
$$;

create trigger incidencia_marca_extemporanea
  before insert on cumplimiento.incidencia
  for each row execute function cumplimiento.marcar_extemporanea();

-- El trabajador responde a una incidencia que abrió el patrón: conforme o inconforme.
create function cumplimiento.responder_incidencia(p_incidencia_id uuid, p_conforme boolean, p_comentario text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incidencia cumplimiento.incidencia;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_ahora timestamptz := now();
begin
  select i.* into v_incidencia from cumplimiento.incidencia i where i.id = p_incidencia_id for update;
  if v_incidencia.id is null
     or tenants.jwt_rol() is distinct from 'empleado'
     or v_incidencia.tenant_id is distinct from tenants.jwt_tenant_id()
     or v_incidencia.trabajador_id is distinct from tenants.jwt_trabajador_id() then
    raise exception 'Solo el propio trabajador puede responder esta incidencia.' using errcode = 'insufficient_privilege';
  end if;
  if v_incidencia.aceptada_en is not null or v_incidencia.inconforme_en is not null then
    raise exception 'Ya respondiste esta incidencia.' using errcode = 'check_violation';
  end if;
  if not p_conforme and v_comentario is null then
    raise exception 'Explica por qué no estás de acuerdo.' using errcode = 'check_violation';
  end if;

  update cumplimiento.incidencia i
  set aceptada_por = case when p_conforme then tenants.jwt_usuario_id() end,
      aceptada_en = case when p_conforme then v_ahora end,
      inconforme_en = case when p_conforme then null else v_ahora end,
      comentario_trabajador = left(v_comentario, 500)
  where i.id = p_incidencia_id;
  return v_ahora;
end;
$$;

comment on function cumplimiento.responder_incidencia(uuid, boolean, text)
  is 'El trabajador manifiesta su conformidad o inconformidad (con comentario) con una incidencia. Una sola vez.';

revoke all on function cumplimiento.responder_incidencia(uuid, boolean, text) from public;
grant execute on function cumplimiento.responder_incidencia(uuid, boolean, text) to authenticated;

-- Marcajes de un trabajador entre dos fechas (día del centro), con su corrección y la
-- conformidad del trabajador. Incluye los anulados, señalados como tales.
create function jornada.detalle_marcajes(p_tenant_id uuid, p_trabajador_id uuid, p_desde date, p_hasta date)
returns table (
  evento_id uuid,
  fecha date,
  tipo text,
  hora_original timestamptz,
  hora_vigente timestamptz,
  ts_servidor timestamptz,
  origen text,
  foto_estado text,
  fuera_de_geocerca boolean,
  anulado boolean,
  -- De dónde sale la hora vigente si no es la original: una corrección o un marcaje por incidencia.
  correccion_evento_id uuid,
  correccion_motivo text,
  correccion_autorizo text,
  correccion_registrada_en timestamptz,
  incidencia_id uuid,
  incidencia_tipo text,
  solicitada_por text,
  conformidad text,
  conformidad_en timestamptz,
  comentario_trabajador text,
  extemporanea boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona text;
begin
  -- Con sesión, solo quien puede ver al trabajador; sin sesión (servidor), sin restricción.
  if auth.uid() is not null and not tenants.puede_ver_trabajador(p_tenant_id, p_trabajador_id) then
    raise exception 'No tienes acceso a los marcajes de esta persona.' using errcode = 'insufficient_privilege';
  end if;

  select c.zona_horaria into v_zona
  from tenants.trabajador t
  join tenants.centro_trabajo c on c.id = t.centro_id
  where t.id = p_trabajador_id and t.tenant_id = p_tenant_id;
  if v_zona is null then
    return;
  end if;

  return query
  with marcas as (
    select
      e.*,
      (
        select c
        from jornada.evento c
        where c.referencia_evento_id = e.id and c.tipo = 'correccion'
        order by c.ts_servidor desc, c.id desc
        limit 1
      ) as correccion
    from jornada.evento e
    where e.tenant_id = p_tenant_id
      and e.trabajador_id = p_trabajador_id
      and e.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
  ),
  horas as (
    select
      m.*,
      coalesce(m.ts_dispositivo, m.ts_servidor) as original,
      coalesce((m.correccion).ts_declarado, jornada.hora_efectiva(m.ts_servidor, m.ts_dispositivo, m.ts_declarado)) as vigente,
      -- El evento que lleva la hora declarada: la corrección o el propio marcaje por incidencia.
      case
        when (m.correccion).id is not null then (m.correccion).id
        when m.origen = 'incidencia' then m.id
      end as declarante_id
    from marcas m
  )
  select
    h.id,
    (h.vigente at time zone v_zona)::date,
    h.tipo,
    -- Un marcaje que nació de una incidencia por olvido no tiene hora original.
    case when h.origen = 'incidencia' then null else h.original end,
    h.vigente,
    h.ts_servidor,
    h.origen,
    h.foto_estado,
    h.fuera_de_geocerca,
    exists (select 1 from jornada.evento a where a.referencia_evento_id = h.id and a.tipo = 'anulacion'),
    h.declarante_id,
    coalesce((h.correccion).motivo, case when h.origen = 'incidencia' then h.motivo end),
    tenants.nombre_de_usuario(coalesce((h.correccion).creado_por, case when h.origen = 'incidencia' then h.creado_por end)),
    coalesce((h.correccion).ts_servidor, case when h.origen = 'incidencia' then h.ts_servidor end),
    i.id,
    i.tipo,
    tenants.nombre_de_usuario(i.solicitado_por),
    case
      when i.id is null then null
      when i.aceptada_en is not null then 'conforme'
      when i.inconforme_en is not null then 'inconforme'
      else 'sin_respuesta'
    end,
    coalesce(i.aceptada_en, i.inconforme_en),
    i.comentario_trabajador,
    coalesce(i.extemporanea, false)
  from horas h
  left join cumplimiento.incidencia i on i.evento_resultante_id = h.declarante_id and i.tenant_id = p_tenant_id
  where (h.vigente at time zone v_zona)::date between p_desde and p_hasta
     or (h.original at time zone v_zona)::date between p_desde and p_hasta
  order by h.vigente, h.id;
end;
$$;

comment on function jornada.detalle_marcajes(uuid, uuid, date, date)
  is 'Marcajes de un trabajador con hora original, hora vigente, corrección (motivo, quién autorizó, cuándo) y conformidad del trabajador.';

revoke all on function jornada.detalle_marcajes(uuid, uuid, date, date) from public;
grant execute on function jornada.detalle_marcajes(uuid, uuid, date, date) to authenticated, service_role;

-- La respuesta del trabajador pasa por responder_incidencia; aceptar_incidencia queda como atajo.
create or replace function cumplimiento.aceptar_incidencia(p_incidencia_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select cumplimiento.responder_incidencia(p_incidencia_id, true);
$$;
