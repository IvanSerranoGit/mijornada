-- Invitación de administradores y supervisores por correo.
--
-- El dueño (o un administrador, para supervisores) da de alta al usuario y el sistema le
-- envía un enlace para fijar su contraseña. El enlace lleva un token de un solo uso que
-- vence en 7 días; aquí solo se guarda su hash. Las funciones que lo leen son del servidor.

create table tenants.invitacion_usuario (
  usuario_id uuid primary key references tenants.usuario (id),
  tenant_id uuid not null references tenants.empresa (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expira_en timestamptz not null default (now() + interval '7 days'),
  aceptada_en timestamptz,
  creado_en timestamptz not null default now()
);

comment on table tenants.invitacion_usuario is 'Enlace pendiente para que un administrador o supervisor invitado fije su contraseña.';

alter table tenants.invitacion_usuario enable row level security;
grant select, insert, update, delete on tenants.invitacion_usuario to service_role;

-- Usuarios del tenant con su correo y si su invitación sigue pendiente. Para administradores.
create function tenants.usuarios_del_tenant()
returns table (
  id uuid,
  rol text,
  nombre text,
  correo text,
  centro_id uuid,
  trabajador_id uuid,
  activo boolean,
  invitacion_pendiente boolean,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.rol,
    coalesce(u.nombre, t.nombre),
    a.email::text,
    u.centro_id,
    u.trabajador_id,
    u.activo,
    coalesce(i.aceptada_en is null and i.expira_en > now(), false),
    u.creado_en
  from tenants.usuario u
  join auth.users a on a.id = u.auth_user_id
  left join tenants.trabajador t on t.id = u.trabajador_id
  left join tenants.invitacion_usuario i on i.usuario_id = u.id
  where u.tenant_id = tenants.jwt_tenant_id()
    and tenants.es_admin_de(u.tenant_id)
    and u.rol in ('dueno', 'administrador', 'supervisor')
  order by u.creado_en;
$$;

revoke all on function tenants.usuarios_del_tenant() from public;
grant execute on function tenants.usuarios_del_tenant() to authenticated;

-- Para el servidor: a quién corresponde un enlace de invitación vigente.
create function tenants.invitacion_de_usuario(p_token text)
returns table (usuario_id uuid, auth_user_id uuid, correo text, empresa text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.auth_user_id, a.email::text, e.razon_social, u.rol
  from tenants.invitacion_usuario i
  join tenants.usuario u on u.id = i.usuario_id and u.activo
  join auth.users a on a.id = u.auth_user_id
  join tenants.empresa e on e.id = u.tenant_id
  where i.token_hash = tenants.hash_token(p_token)
    and i.aceptada_en is null
    and i.expira_en > now();
$$;

revoke all on function tenants.invitacion_de_usuario(text) from public;
grant execute on function tenants.invitacion_de_usuario(text) to service_role;
