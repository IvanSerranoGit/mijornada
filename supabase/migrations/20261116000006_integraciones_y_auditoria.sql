-- Dominios integraciones (conector, exportacion) y auditoria (bitacora_admin).

create table integraciones.conector (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  tipo text not null check (tipo in ('aspel_noi', 'contpaqi', 'webhook', 'api_key')),
  config_cifrada bytea,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id)
);

comment on table integraciones.conector is 'Conector hacia nóminas y terceros.';
comment on column integraciones.conector.config_cifrada is 'Configuración JSON (credenciales incluidas) cifrada con tenants.cifrar(tenant_id, texto).';

-- Historial de lo exportado.
create table integraciones.exportacion (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  conector_id uuid not null,
  periodo daterange not null check (not isempty(periodo)),
  formato text not null,
  generado_en timestamptz not null default now(),
  archivo_url text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'generada', 'fallida')),
  foreign key (tenant_id, conector_id) references integraciones.conector (tenant_id, id)
);

comment on table integraciones.exportacion is 'Cada archivo exportado hacia una nómina o tercero.';

create index exportacion_conector_idx on integraciones.exportacion (tenant_id, conector_id, generado_en);

-- Todo cambio administrativo (no de marcas) con su antes y después.
create table auditoria.bitacora_admin (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  usuario_id uuid references tenants.usuario (id),
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  antes jsonb,
  despues jsonb,
  ip inet,
  ts timestamptz not null default now()
);

comment on table auditoria.bitacora_admin is 'Bitácora de cambios administrativos y de accesos de inspector (con IP y hora).';
comment on column auditoria.bitacora_admin.usuario_id is 'Quién hizo el cambio; null si lo hizo un job del servidor.';

create index bitacora_admin_ts_idx on auditoria.bitacora_admin (tenant_id, ts);
create index bitacora_admin_entidad_idx on auditoria.bitacora_admin (tenant_id, entidad, entidad_id);
