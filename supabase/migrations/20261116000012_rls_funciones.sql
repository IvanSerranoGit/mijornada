-- Funciones de apoyo para RLS: claims del JWT y predicados de acceso.
--
-- Claims que agrega tenants.claims_token_acceso al JWT de Supabase Auth:
--   tenant_id, rol, usuario_id, centro_id, trabajador_id.

-- Hook "custom access token" de Supabase Auth (se activa en supabase/config.toml).
-- Si la persona tiene usuarios en varios tenants, se usa el más antiguo que esté activo.
create function tenants.claims_token_acceso(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_usuario record;
begin
  select u.id, u.tenant_id, u.rol, u.centro_id, u.trabajador_id
  into v_usuario
  from tenants.usuario u
  where u.auth_user_id = (event ->> 'user_id')::uuid
    and u.activo
  order by u.creado_en, u.id
  limit 1;

  if found then
    v_claims := v_claims || jsonb_build_object(
      'tenant_id', v_usuario.tenant_id,
      'rol', v_usuario.rol,
      'usuario_id', v_usuario.id,
      'centro_id', v_usuario.centro_id,
      'trabajador_id', v_usuario.trabajador_id
    );
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function tenants.claims_token_acceso(jsonb) is 'Hook de Supabase Auth: agrega tenant_id, rol, usuario_id, centro_id y trabajador_id al JWT.';

revoke all on function tenants.claims_token_acceso(jsonb) from public;
grant usage on schema tenants to supabase_auth_admin;
grant execute on function tenants.claims_token_acceso(jsonb) to supabase_auth_admin;
grant select on tenants.usuario to supabase_auth_admin;

-- Lectura de claims.
create function tenants.jwt_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'tenant_id', '')::uuid; $$;

create function tenants.jwt_rol()
returns text
language sql
stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'rol', ''); $$;

create function tenants.jwt_usuario_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'usuario_id', '')::uuid; $$;

create function tenants.jwt_centro_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'centro_id', '')::uuid; $$;

create function tenants.jwt_trabajador_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select nullif(auth.jwt() ->> 'trabajador_id', '')::uuid; $$;

-- Los predicados son SECURITY DEFINER para consultar tablas con RLS sin recursión.

-- El tenant es el propio o, para un usuario de despacho, uno que lo autorizó
-- (la autorización se consulta en vivo: revocarla surte efecto de inmediato).
create function tenants.tenant_autorizado(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_tenant_id = tenants.jwt_tenant_id()
    or (
      tenants.jwt_rol() = 'despacho'
      and exists (
        select 1
        from tenants.despacho_autorizacion a
        where a.tenant_id = p_tenant_id
          and a.despacho_id = tenants.jwt_tenant_id()
          and a.revocado_en is null
      )
    ),
    false
  );
$$;

-- Dueño, administrador o despacho autorizado.
create function tenants.es_admin_de(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    tenants.jwt_rol() in ('dueno', 'administrador', 'despacho')
    and tenants.tenant_autorizado(p_tenant_id),
    false
  );
$$;

create function tenants.es_dueno_de(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(tenants.jwt_rol() = 'dueno' and p_tenant_id = tenants.jwt_tenant_id(), false);
$$;

create function tenants.centro_de_trabajador(p_trabajador_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select t.centro_id from tenants.trabajador t where t.id = p_trabajador_id; $$;

-- Supervisor del centro indicado, dentro de su propio tenant.
create function tenants.es_supervisor_de_centro(p_tenant_id uuid, p_centro_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    tenants.jwt_rol() = 'supervisor'
    and p_tenant_id = tenants.jwt_tenant_id()
    and p_centro_id = tenants.jwt_centro_id(),
    false
  );
$$;

-- Quién puede ver lo de un trabajador: administradores del tenant, el supervisor
-- de su centro y el propio trabajador.
create function tenants.puede_ver_trabajador(p_tenant_id uuid, p_trabajador_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    tenants.es_admin_de(p_tenant_id)
    or tenants.es_supervisor_de_centro(p_tenant_id, tenants.centro_de_trabajador(p_trabajador_id))
    or (
      tenants.jwt_rol() = 'empleado'
      and p_tenant_id = tenants.jwt_tenant_id()
      and p_trabajador_id = tenants.jwt_trabajador_id()
    ),
    false
  );
$$;

-- El inspector solo lee el reporte de un acceso vigente (72 h, no revocado).
create function cumplimiento.inspector_puede_ver_reporte(p_tenant_id uuid, p_reporte_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    tenants.jwt_rol() = 'inspector'
    and p_tenant_id = tenants.jwt_tenant_id()
    and exists (
      select 1
      from cumplimiento.acceso_inspector a
      where a.reporte_id = p_reporte_id
        and a.tenant_id = p_tenant_id
        and a.usuario_id = tenants.jwt_usuario_id()
        and a.revocado_en is null
        and a.expira_en > now()
    ),
    false
  );
$$;

-- Plan, estado y tipo de empresa: solo el dueño (el administrador no los cambia).
-- Sin JWT (jobs del servidor) no hay restricción.
create function tenants.proteger_plan_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tenants.jwt_rol() is not null
     and tenants.jwt_rol() <> 'dueno'
     and (new.plan, new.estado, new.es_despacho) is distinct from (old.plan, old.estado, old.es_despacho) then
    raise exception 'Solo el dueño puede cambiar el plan o el estado de la empresa.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger empresa_protege_plan
  before update on tenants.empresa
  for each row execute function tenants.proteger_plan_empresa();
