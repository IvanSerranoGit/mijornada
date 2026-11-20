-- Sprint 3, fase 4: planes, prueba de 14 días y cobro con Stripe.
--
--   * tenants.empresa.plan: prueba, basico, negocio o crecimiento. El plan y los datos de
--     Stripe solo los escribe el servidor (webhook de Stripe, con rol de servicio); el
--     dueño ya no puede cambiarlos desde la API.
--   * Prueba: 14 días desde el alta (prueba_hasta), sin tarjeta.
--   * Bloqueo suave: con la prueba vencida o un pago fallido, la cuenta queda en "solo
--     lectura" para la administración. Nunca se deja de registrar la jornada, nunca se
--     borra ni se oculta nada. Lo decide tenants.estado_de_cuenta; lo aplica la API.
--   * Límite de personas por plan: es un aviso, no un bloqueo.

alter table tenants.empresa
  add column prueba_hasta timestamptz,
  add column plan_hasta timestamptz,
  add column plan_ciclo text check (plan_ciclo in ('mensual', 'anual')),
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column pago_fallido_en timestamptz,
  add column regimen_fiscal text,
  add column cp_fiscal text check (cp_fiscal is null or cp_fiscal ~ '^[0-9]{5}$'),
  add column uso_cfdi text,
  add constraint empresa_plan_check check (plan in ('prueba', 'basico', 'negocio', 'crecimiento'));

comment on column tenants.empresa.prueba_hasta is 'Fin de la prueba gratuita de 14 días.';
comment on column tenants.empresa.plan_hasta is 'Fin del periodo pagado en curso (lo informa Stripe).';
comment on column tenants.empresa.pago_fallido_en is 'Cuándo falló el último cobro; nulo si la suscripción está al corriente.';
comment on column tenants.empresa.uso_cfdi is 'Uso de CFDI para la factura, que por ahora se emite a mano (facturacion@mijornada.xyz).';

-- Las empresas que ya existían empiezan su prueba hoy.
update tenants.empresa set prueba_hasta = now() + interval '14 days' where prueba_hasta is null;

alter table tenants.empresa alter column prueba_hasta set default (now() + interval '14 days');
alter table tenants.empresa alter column prueba_hasta set not null;

-- El plan y el estado ya no se cambian desde la API del dueño.
revoke update (plan, estado) on tenants.empresa from authenticated;
grant update (regimen_fiscal, cp_fiscal, uso_cfdi) on tenants.empresa to authenticated;

-- Catálogo de planes: límite de personas incluidas. Los precios viven en Stripe.
create function tenants.limite_de_plan(p_plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'basico' then 10
    when 'negocio' then 30
    when 'crecimiento' then 60
    -- En la prueba se puede evaluar el producto con todo el equipo.
    else 60
  end;
$$;

-- Estado de la cuenta de un tenant: qué plan tiene, si puede administrar y por qué no.
create function tenants.estado_de_cuenta(p_tenant_id uuid)
returns table (
  plan text,
  plan_ciclo text,
  prueba_hasta timestamptz,
  plan_hasta timestamptz,
  limite_personas integer,
  personas_activas integer,
  -- completo: todo disponible. solo_lectura: la administración queda en consulta.
  acceso text,
  -- Por qué está en solo lectura: prueba_vencida o pago_fallido.
  motivo text,
  tiene_suscripcion boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.plan,
    e.plan_ciclo,
    e.prueba_hasta,
    e.plan_hasta,
    tenants.limite_de_plan(e.plan),
    (select count(*)::integer from tenants.trabajador t where t.tenant_id = e.id and t.fecha_baja is null),
    case
      when e.plan = 'prueba' and e.prueba_hasta < now() then 'solo_lectura'
      when e.plan <> 'prueba' and e.pago_fallido_en is not null then 'solo_lectura'
      else 'completo'
    end,
    case
      when e.plan = 'prueba' and e.prueba_hasta < now() then 'prueba_vencida'
      when e.plan <> 'prueba' and e.pago_fallido_en is not null then 'pago_fallido'
    end,
    e.stripe_subscription_id is not null
  from tenants.empresa e
  where e.id = p_tenant_id
    and (auth.uid() is null or e.id = tenants.jwt_tenant_id());
$$;

comment on function tenants.estado_de_cuenta(uuid)
  is 'Plan, límite de personas y si la administración está en solo lectura (prueba vencida o pago fallido).';

revoke all on function tenants.estado_de_cuenta(uuid) from public;
grant execute on function tenants.estado_de_cuenta(uuid) to authenticated, service_role;

-- Eventos de Stripe ya procesados: un mismo evento puede llegar más de una vez.
create table tenants.evento_stripe (
  id text primary key,
  tipo text not null,
  tenant_id uuid references tenants.empresa (id),
  recibido_en timestamptz not null default now()
);

comment on table tenants.evento_stripe is 'Eventos del webhook de Stripe ya aplicados, para no aplicarlos dos veces.';

alter table tenants.evento_stripe enable row level security;
grant select, insert on tenants.evento_stripe to service_role;

-- Aplica a la empresa lo que dice Stripe. Solo el servidor (webhook).
-- Devuelve false si ese evento ya se había aplicado.
create function tenants.aplicar_evento_stripe(
  p_evento_id text,
  p_tipo text,
  p_tenant_id uuid,
  p_customer_id text,
  p_subscription_id text,
  -- Plan pagado vigente; nulo si la suscripción terminó.
  p_plan text,
  p_ciclo text,
  p_plan_hasta timestamptz,
  -- true: el cobro falló; false: está al corriente; nulo: este evento no lo dice.
  p_pago_fallido boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := p_tenant_id;
begin
  -- Un evento sin tenant (sin metadatos) se busca por el cliente de Stripe.
  if v_tenant_id is null then
    select e.id into v_tenant_id from tenants.empresa e where e.stripe_customer_id = p_customer_id;
  end if;
  if v_tenant_id is null then
    raise exception 'El evento de Stripe no corresponde a ninguna empresa.' using errcode = 'no_data_found';
  end if;

  insert into tenants.evento_stripe (id, tipo, tenant_id) values (p_evento_id, p_tipo, v_tenant_id)
  on conflict (id) do nothing;
  if not found then
    return false;
  end if;

  update tenants.empresa e
  set stripe_customer_id = coalesce(p_customer_id, e.stripe_customer_id),
      stripe_subscription_id = case
        when p_tipo = 'customer.subscription.deleted' then null
        else coalesce(p_subscription_id, e.stripe_subscription_id)
      end,
      plan = case
        when p_tipo = 'customer.subscription.deleted' then 'prueba'
        else coalesce(p_plan, e.plan)
      end,
      plan_ciclo = case
        when p_tipo = 'customer.subscription.deleted' then null
        else coalesce(p_ciclo, e.plan_ciclo)
      end,
      plan_hasta = coalesce(p_plan_hasta, e.plan_hasta),
      -- Sin suscripción vuelve a "prueba" con la prueba ya consumida: queda en solo lectura.
      prueba_hasta = case
        when p_tipo = 'customer.subscription.deleted' then least(e.prueba_hasta, now())
        else e.prueba_hasta
      end,
      pago_fallido_en = case
        when p_tipo = 'customer.subscription.deleted' then null
        when p_pago_fallido is true then coalesce(e.pago_fallido_en, now())
        when p_pago_fallido is false then null
        else e.pago_fallido_en
      end
  where e.id = v_tenant_id;
  return true;
end;
$$;

revoke all on function tenants.aplicar_evento_stripe(text, text, uuid, text, text, text, text, timestamptz, boolean) from public;
grant execute on function tenants.aplicar_evento_stripe(text, text, uuid, text, text, text, text, timestamptz, boolean) to service_role;
