-- Días de gracia tras un cobro fallido, y CURP en el convenio.
--
--   * Un cobro fallido ya no pasa la cuenta a solo lectura de inmediato: hay un plazo de
--     gracia (calculo.regla dias_gracia_pago, hoy 7 días) con aviso en el panel y por
--     correo. Vencido el plazo sin pago, solo lectura.
--   * tenants.curp_de_trabajador descifra la CURP para imprimirla en el convenio. Solo la
--     obtiene un administrador del tenant o la propia persona.

drop function tenants.estado_de_cuenta(uuid);

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
  tiene_suscripcion boolean,
  -- Cobro fallido sin regularizar: desde cuándo y hasta cuándo dura la gracia.
  pago_fallido_en timestamptz,
  gracia_hasta timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with cuenta as (
    select
      e.*,
      e.pago_fallido_en
        + make_interval(days => coalesce(calculo.regla_vigente('dias_gracia_pago', current_date), 0)::integer)
        as gracia_hasta
    from tenants.empresa e
    where e.id = p_tenant_id
      and (auth.uid() is null or e.id = tenants.jwt_tenant_id())
  )
  select
    c.plan,
    c.plan_ciclo,
    c.prueba_hasta,
    c.plan_hasta,
    tenants.limite_de_plan(c.plan),
    (select count(*)::integer from tenants.trabajador t where t.tenant_id = c.id and t.fecha_baja is null),
    case
      when c.plan = 'prueba' and c.prueba_hasta < now() then 'solo_lectura'
      when c.plan <> 'prueba' and c.gracia_hasta < now() then 'solo_lectura'
      else 'completo'
    end,
    case
      when c.plan = 'prueba' and c.prueba_hasta < now() then 'prueba_vencida'
      when c.plan <> 'prueba' and c.gracia_hasta < now() then 'pago_fallido'
    end,
    c.stripe_subscription_id is not null,
    case when c.plan <> 'prueba' then c.pago_fallido_en end,
    case when c.plan <> 'prueba' then c.gracia_hasta end
  from cuenta c;
$$;

comment on function tenants.estado_de_cuenta(uuid)
  is 'Plan, límite de personas, cobro fallido con su plazo de gracia y si la administración está en solo lectura.';

revoke all on function tenants.estado_de_cuenta(uuid) from public;
grant execute on function tenants.estado_de_cuenta(uuid) to authenticated, service_role;

-- CURP de una persona, descifrada, para el convenio de registro.
create function tenants.curp_de_trabajador(p_trabajador_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trabajador tenants.trabajador;
begin
  select t.* into v_trabajador from tenants.trabajador t where t.id = p_trabajador_id;
  if v_trabajador.id is null or not (
    tenants.es_admin_de(v_trabajador.tenant_id)
    or (
      tenants.jwt_rol() = 'empleado'
      and v_trabajador.tenant_id = tenants.jwt_tenant_id()
      and v_trabajador.id = tenants.jwt_trabajador_id()
    )
  ) then
    raise exception 'No tienes acceso a los datos de esta persona.' using errcode = 'insufficient_privilege';
  end if;
  if v_trabajador.curp_cifrado is null then
    return null;
  end if;
  return tenants.descifrar(v_trabajador.tenant_id, v_trabajador.curp_cifrado);
end;
$$;

comment on function tenants.curp_de_trabajador(uuid)
  is 'CURP descifrada de una persona, para su convenio. Solo un administrador del tenant o la propia persona.';

revoke all on function tenants.curp_de_trabajador(uuid) from public;
grant execute on function tenants.curp_de_trabajador(uuid) to authenticated;
