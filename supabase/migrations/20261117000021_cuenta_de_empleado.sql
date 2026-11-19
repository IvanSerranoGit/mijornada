-- Entrada con correo + PIN: busca la cuenta del empleado por correo sin crear nada.
-- (Generar un enlace mágico para un correo desconocido crearía una cuenta vacía.)
create function tenants.cuenta_de_empleado(p_correo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select au.id
  from auth.users au
  join tenants.usuario u on u.auth_user_id = au.id
  where lower(au.email) = lower(btrim(p_correo))
    and u.rol = 'empleado'
    and u.activo
  limit 1;
$$;

revoke all on function tenants.cuenta_de_empleado(text) from public;
grant execute on function tenants.cuenta_de_empleado(text) to service_role;
