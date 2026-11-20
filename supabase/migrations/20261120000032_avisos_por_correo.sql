-- Avisos por correo que salen de un job del servidor (cron diario).
--
-- tenants.avisos_pendientes() calcula qué avisos tocan hoy y a quién; el servidor los
-- envía y los anota en tenants.aviso_enviado para no repetirlos. Los plazos:
--   * consentimiento pendiente: a los 3 y a los 7 días, al trabajador (si ya tiene cuenta)
--     y al dueño;
--   * prueba por vencer: día 10 y día 13 de los 14;
--   * pago fallido: día 3 y día 6 (el día 0 lo envía el webhook de Stripe al momento);
--   * incidencias: al dueño cuando hay una por resolver; al trabajador cuando su empresa
--     abrió una y falta su respuesta.

create table tenants.aviso_enviado (
  tenant_id uuid not null references tenants.empresa (id),
  -- Identifica el aviso y a su destinatario; el mismo aviso no se envía dos veces.
  clave text not null,
  enviado_en timestamptz not null default now(),
  primary key (tenant_id, clave)
);

comment on table tenants.aviso_enviado is 'Avisos por correo ya enviados, para no repetirlos.';

alter table tenants.aviso_enviado enable row level security;
grant select, insert on tenants.aviso_enviado to service_role;

create function tenants.avisos_pendientes()
returns table (
  tenant_id uuid,
  clave text,
  -- consentimiento, consentimiento_equipo, prueba_por_vencer, pago_fallido, incidencia_por_resolver, incidencia_por_responder
  tipo text,
  correo text,
  -- Datos para redactar el correo (nombres, días, fechas).
  datos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with duenos as (
    select u.tenant_id, a.email::text as correo
    from tenants.usuario u
    join auth.users a on a.id = u.auth_user_id
    where u.rol = 'dueno' and u.activo
  ),
  cuentas_de_trabajador as (
    select u.trabajador_id, a.email::text as correo
    from tenants.usuario u
    join auth.users a on a.id = u.auth_user_id
    where u.rol = 'empleado' and u.activo and u.trabajador_id is not null
  ),
  -- Personas con algún documento vigente sin aceptar, y desde cuándo lo tienen pendiente.
  consentimientos as (
    select
      t.tenant_id,
      t.id as trabajador_id,
      t.nombre,
      e.razon_social,
      string_agg(d.id::text, ',' order by d.id) as documentos,
      extract(day from now() - max(greatest(t.creado_en, d.creado_en)))::integer as dias
    from tenants.trabajador t
    join tenants.empresa e on e.id = t.tenant_id
    join lateral cumplimiento.documentos_vigentes(t.tenant_id) d on true
    where t.fecha_baja is null
      and not exists (
        select 1 from cumplimiento.consentimiento c
        where c.trabajador_id = t.id and c.documento_id = d.id
      )
    group by t.tenant_id, t.id, t.nombre, e.razon_social
  ),
  umbrales as (
    select c.*, case when c.dias >= 7 then 7 else 3 end as umbral
    from consentimientos c
    where c.dias >= 3
  ),
  candidatos as (
    -- Al trabajador que ya tiene cuenta.
    select
      u.tenant_id,
      format('consentimiento:%s:%s:%s:trabajador', u.trabajador_id, md5(u.documentos), u.umbral) as clave,
      'consentimiento' as tipo,
      ct.correo,
      jsonb_build_object('nombre', u.nombre, 'empresa', u.razon_social, 'dias', u.dias) as datos
    from umbrales u
    join cuentas_de_trabajador ct on ct.trabajador_id = u.trabajador_id

    union all
    -- Al dueño: un aviso por persona y umbral; el servidor los junta en un solo correo.
    select
      u.tenant_id,
      format('consentimiento:%s:%s:%s:dueno', u.trabajador_id, md5(u.documentos), u.umbral),
      'consentimiento_equipo',
      d.correo,
      jsonb_build_object('nombre', u.nombre, 'empresa', u.razon_social, 'dias', u.dias)
    from umbrales u
    join duenos d on d.tenant_id = u.tenant_id

    union all
    -- Prueba por vencer: día 10 (quedan 4) y día 13 (queda 1).
    select
      e.id,
      format('prueba:%s:%s', e.prueba_hasta::date, case when e.prueba_hasta - now() <= interval '1 day' then 13 else 10 end),
      'prueba_por_vencer',
      d.correo,
      jsonb_build_object(
        'empresa', e.razon_social,
        'dias_restantes', greatest(ceil(extract(epoch from e.prueba_hasta - now()) / 86400)::integer, 0),
        'prueba_hasta', e.prueba_hasta
      )
    from tenants.empresa e
    join duenos d on d.tenant_id = e.id
    where e.plan = 'prueba'
      and e.stripe_subscription_id is null
      and e.prueba_hasta > now()
      and e.prueba_hasta - now() <= interval '4 days'

    union all
    -- Pago fallido: día 3 y día 6 de la gracia.
    select
      e.id,
      format('pago:%s:%s', e.pago_fallido_en::date, case when now() - e.pago_fallido_en >= interval '6 days' then 6 else 3 end),
      'pago_fallido',
      d.correo,
      jsonb_build_object(
        'empresa', e.razon_social,
        'dia', case when now() - e.pago_fallido_en >= interval '6 days' then 6 else 3 end,
        'gracia_hasta', e.pago_fallido_en
          + make_interval(days => coalesce(calculo.regla_vigente('dias_gracia_pago', current_date), 0)::integer)
      )
    from tenants.empresa e
    join duenos d on d.tenant_id = e.id
    where e.plan <> 'prueba'
      and e.pago_fallido_en is not null
      and now() - e.pago_fallido_en >= interval '3 days'

    union all
    -- Incidencias pendientes: al dueño.
    select
      i.tenant_id,
      format('incidencia:%s:dueno', i.id),
      'incidencia_por_resolver',
      d.correo,
      jsonb_build_object('nombre', t.nombre, 'empresa', e.razon_social, 'tipo', i.tipo, 'fecha', i.fecha)
    from cumplimiento.incidencia i
    join tenants.trabajador t on t.id = i.trabajador_id
    join tenants.empresa e on e.id = i.tenant_id
    join duenos d on d.tenant_id = i.tenant_id
    where i.estado = 'pendiente'

    union all
    -- Incidencias que abrió la empresa y esperan la respuesta del trabajador.
    select
      i.tenant_id,
      format('incidencia:%s:trabajador', i.id),
      'incidencia_por_responder',
      ct.correo,
      jsonb_build_object('nombre', t.nombre, 'empresa', e.razon_social, 'tipo', i.tipo, 'fecha', i.fecha)
    from cumplimiento.incidencia i
    join tenants.trabajador t on t.id = i.trabajador_id
    join tenants.empresa e on e.id = i.tenant_id
    join cuentas_de_trabajador ct on ct.trabajador_id = i.trabajador_id
    where i.aceptada_en is null
      and i.inconforme_en is null
      and i.creado_en > now() - interval '30 days'
  )
  select c.tenant_id, c.clave, c.tipo, c.correo, c.datos
  from candidatos c
  where c.correo is not null
    -- Las cuentas internas (inspector) no reciben correo.
    and c.correo not like '%@inspector.mijornada.xyz'
    and not exists (
      select 1 from tenants.aviso_enviado a where a.tenant_id = c.tenant_id and a.clave = c.clave
    );
$$;

comment on function tenants.avisos_pendientes()
  is 'Avisos por correo que tocan hoy y todavía no se envían. Solo para el servidor.';

revoke all on function tenants.avisos_pendientes() from public;
grant execute on function tenants.avisos_pendientes() to service_role;
