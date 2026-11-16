-- Dominio tenants: empresa, centro_trabajo, trabajador, usuario, horario
-- y autorizaciones de despacho.

-- Un tenant por empresa. `id` es el tenant_id del resto de las tablas.
create table tenants.empresa (
  id uuid primary key default public.uuid_v7(),
  razon_social text not null check (length(btrim(razon_social)) > 0),
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  tamano text not null check (tamano in ('micro', 'pequena', 'mediana', 'grande')),
  jurisdiccion text not null check (jurisdiccion in ('federal', 'local')),
  sector text,
  plan text not null default 'prueba',
  estado text not null default 'activa' check (estado in ('activa', 'suspendida', 'cancelada')),
  es_despacho boolean not null default false,
  creado_en timestamptz not null default now()
);

comment on table tenants.empresa is 'Un tenant por empresa. Un despacho es un tenant con es_despacho = true.';
comment on column tenants.empresa.rfc is 'Opcional en microempresas.';

create table tenants.centro_trabajo (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  nombre text not null check (length(btrim(nombre)) > 0),
  direccion text,
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  radio_m integer check (radio_m > 0),
  zona_horaria text not null,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id)
);

comment on table tenants.centro_trabajo is 'Centro de trabajo. La geocerca (lat, lng, radio_m) es opcional; la zona horaria es obligatoria.';
comment on column tenants.centro_trabajo.zona_horaria is 'Zona IANA (p. ej. America/Mexico_City). Solo se usa para mostrar y para calcular el día laboral.';

-- Valida que la zona horaria exista en el catálogo IANA de Postgres.
create function tenants.validar_zona_horaria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.zona_horaria) then
    raise exception 'La zona horaria "%" no es una zona IANA válida.', new.zona_horaria
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger centro_trabajo_valida_zona_horaria
  before insert or update of zona_horaria on tenants.centro_trabajo
  for each row execute function tenants.validar_zona_horaria();

create table tenants.trabajador (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  centro_id uuid not null,
  nombre text not null check (length(btrim(nombre)) > 0),
  curp_cifrado bytea,
  nss_cifrado bytea,
  puesto text,
  fecha_alta date not null default current_date,
  fecha_baja date,
  tipo_jornada text not null default 'diurna' check (tipo_jornada in ('diurna', 'mixta', 'nocturna')),
  menor_de_edad boolean not null default false,
  metodo_marcaje text not null default 'pin' check (metodo_marcaje in ('pin', 'qr', 'app')),
  pin_hash text,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, centro_id) references tenants.centro_trabajo (tenant_id, id),
  check (fecha_baja is null or fecha_baja >= fecha_alta)
);

comment on table tenants.trabajador is 'Trabajador de un centro. CURP y NSS son opcionales y se guardan cifrados con la llave del tenant.';
comment on column tenants.trabajador.curp_cifrado is 'CURP cifrada con tenants.cifrar(tenant_id, texto).';
comment on column tenants.trabajador.nss_cifrado is 'NSS cifrado con tenants.cifrar(tenant_id, texto).';
comment on column tenants.trabajador.menor_de_edad is 'Un menor de 18 años no puede generar tiempo extraordinario.';
comment on column tenants.trabajador.pin_hash is 'Hash del PIN de marcaje; el PIN nunca se guarda en claro.';

create index trabajador_centro_idx on tenants.trabajador (tenant_id, centro_id);

-- Usuario del sistema, vinculado a Supabase Auth. El rol viaja como claim del JWT.
create table tenants.usuario (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  auth_user_id uuid not null references auth.users (id),
  rol text not null check (
    rol in ('dueno', 'administrador', 'supervisor', 'empleado', 'kiosco', 'inspector', 'despacho')
  ),
  centro_id uuid,
  trabajador_id uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, auth_user_id),
  foreign key (tenant_id, centro_id) references tenants.centro_trabajo (tenant_id, id),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  -- El supervisor y el kiosco operan sobre un centro; el empleado es un trabajador.
  check (rol not in ('supervisor', 'kiosco') or centro_id is not null),
  check (rol <> 'empleado' or trabajador_id is not null)
);

comment on table tenants.usuario is 'Usuario vinculado a Supabase Auth. El kiosco es un usuario de dispositivo; el inspector es temporal y de solo lectura.';
comment on column tenants.usuario.centro_id is 'Centro asignado (obligatorio para supervisor y kiosco).';
comment on column tenants.usuario.trabajador_id is 'Trabajador al que corresponde el usuario (obligatorio para empleado).';

create index usuario_auth_user_idx on tenants.usuario (auth_user_id);

-- Historial de horarios: nunca se sobreescribe, cada cambio es una vigencia nueva.
create table tenants.horario (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  trabajador_id uuid not null,
  vigente_desde date not null,
  vigente_hasta date,
  dias jsonb not null check (jsonb_typeof(dias) = 'array'),
  hora_entrada time not null,
  hora_salida time not null,
  descanso_semanal smallint[] not null default '{7}' check (descanso_semanal <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- Un trabajador no puede tener dos horarios vigentes el mismo día.
  exclude using gist (
    trabajador_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  )
);

comment on table tenants.horario is 'Horario del trabajador con vigencia. vigente_hasta es inclusivo; null significa vigente a la fecha.';
comment on column tenants.horario.dias is 'Arreglo JSON de días laborables en numeración ISO (1 = lunes … 7 = domingo).';
comment on column tenants.horario.descanso_semanal is 'Días de descanso en numeración ISO (1 = lunes … 7 = domingo).';

-- Un despacho administra varios tenants, cada uno autorizado por su dueño.
create table tenants.despacho_autorizacion (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  despacho_id uuid not null references tenants.empresa (id),
  autorizado_por uuid not null,
  autorizado_en timestamptz not null default now(),
  revocado_en timestamptz,
  foreign key (tenant_id, autorizado_por) references tenants.usuario (tenant_id, id),
  check (tenant_id <> despacho_id)
);

comment on table tenants.despacho_autorizacion is 'Autorización que el dueño de un tenant da a un despacho para administrarlo.';
comment on column tenants.despacho_autorizacion.tenant_id is 'Empresa que autoriza.';
comment on column tenants.despacho_autorizacion.despacho_id is 'Empresa (es_despacho = true) que recibe la autorización.';

create unique index despacho_autorizacion_vigente_idx
  on tenants.despacho_autorizacion (tenant_id, despacho_id)
  where revocado_en is null;

create index despacho_autorizacion_despacho_idx on tenants.despacho_autorizacion (despacho_id);

-- Cifrado en columna con llave por tenant. La llave vive en Supabase Vault con
-- el nombre `tenant_<id>` y se crea la primera vez que se necesita.
create function tenants.llave_cifrado(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := 'tenant_' || p_tenant_id::text;
  v_llave text;
begin
  select decrypted_secret into v_llave from vault.decrypted_secrets where name = v_nombre;
  if v_llave is null then
    v_llave := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_llave, v_nombre, 'Llave de cifrado en columna del tenant');
  end if;
  return v_llave;
end;
$$;

create function tenants.cifrar(p_tenant_id uuid, p_texto text)
returns bytea
language sql
security definer
set search_path = ''
as $$
  select case
    when p_texto is null then null
    else extensions.pgp_sym_encrypt(p_texto, tenants.llave_cifrado(p_tenant_id))
  end;
$$;

create function tenants.descifrar(p_tenant_id uuid, p_dato bytea)
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when p_dato is null then null
    else extensions.pgp_sym_decrypt(p_dato, tenants.llave_cifrado(p_tenant_id))
  end;
$$;

comment on function tenants.cifrar(uuid, text) is 'Cifra un texto (CURP, NSS, credenciales) con la llave del tenant.';
comment on function tenants.descifrar(uuid, bytea) is 'Descifra un dato cifrado con tenants.cifrar.';

-- Solo el servidor puede cifrar o descifrar; nunca los clientes.
revoke all on function tenants.llave_cifrado(uuid) from public;
revoke all on function tenants.cifrar(uuid, text) from public;
revoke all on function tenants.descifrar(uuid, bytea) from public;
grant execute on function tenants.cifrar(uuid, text) to service_role;
grant execute on function tenants.descifrar(uuid, bytea) to service_role;
