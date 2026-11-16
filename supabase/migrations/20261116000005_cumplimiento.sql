-- Dominio cumplimiento: documento, consentimiento, incidencia, reporte y acceso de inspector.

-- Documentos versionados: cada cambio es una versión nueva.
create table cumplimiento.documento (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  tipo text not null check (tipo in ('convenio_registro', 'aviso_privacidad', 'reglamento')),
  version integer not null check (version > 0),
  contenido_hash text not null check (contenido_hash ~ '^[0-9a-f]{64}$'),
  url_pdf text,
  vigente_desde date not null,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, tipo, version)
);

comment on table cumplimiento.documento is 'Convenio de registro, aviso de privacidad y reglamento, versionados por tenant.';

-- Prueba del acuerdo con el trabajador (art. 132 fr. XXXIV).
create table cumplimiento.consentimiento (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  trabajador_id uuid not null,
  documento_id uuid not null,
  aceptado_en timestamptz not null default now(),
  ip inet,
  user_agent text,
  metodo text not null check (metodo in ('clic', 'firma_simple', 'firma_autografa')),
  evidencia_hash text check (evidencia_hash ~ '^[0-9a-f]{64}$'),
  unique (tenant_id, id),
  unique (trabajador_id, documento_id),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  foreign key (tenant_id, documento_id) references cumplimiento.documento (tenant_id, id)
);

comment on table cumplimiento.consentimiento is 'Aceptación de una versión de documento por un trabajador, con su evidencia.';

-- Incidencias: toda resolución aprobada genera un evento en jornada.
create table cumplimiento.incidencia (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  trabajador_id uuid not null,
  fecha date not null,
  tipo text not null check (tipo in ('olvido', 'permiso', 'home_office', 'falta_justificada')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo text not null check (length(btrim(motivo)) > 0),
  solicitado_por uuid not null references tenants.usuario (id),
  resuelto_por uuid references tenants.usuario (id),
  resuelto_en timestamptz,
  evento_resultante_id uuid,
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, trabajador_id) references tenants.trabajador (tenant_id, id),
  -- Una incidencia resuelta registra quién y cuándo; una pendiente, no.
  check ((estado = 'pendiente') = (resuelto_por is null)),
  check ((resuelto_por is null) = (resuelto_en is null))
);

comment on table cumplimiento.incidencia is 'Olvido de marca, permiso, home office o falta justificada. Nadie edita marcas: se aprueba una incidencia y el sistema inserta el evento.';
comment on column cumplimiento.incidencia.evento_resultante_id is 'Evento de jornada generado al aprobar. Sin llave foránea porque jornada.evento está particionada.';

create index incidencia_trabajador_idx on cumplimiento.incidencia (tenant_id, trabajador_id, fecha);
create index incidencia_pendiente_idx on cumplimiento.incidencia (tenant_id) where estado = 'pendiente';

-- Reportes: lo que se entrega a la autoridad.
create table cumplimiento.reporte (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  tipo text not null check (tipo in ('inspeccion', 'periodo', 'trabajador')),
  rango daterange not null check (not isempty(rango)),
  generado_en timestamptz not null default now(),
  hash_contenido text not null check (hash_contenido ~ '^[0-9a-f]{64}$'),
  url_pdf text,
  url_csv text,
  solicitante uuid not null references tenants.usuario (id),
  unique (tenant_id, id)
);

comment on table cumplimiento.reporte is 'Reporte generado (PDF y CSV) con el hash de su contenido y quién lo solicitó.';

create index reporte_generado_idx on cumplimiento.reporte (tenant_id, generado_en);

-- Acceso temporal de un inspector a un reporte y a su verificación (72 h).
create table cumplimiento.acceso_inspector (
  id uuid primary key default public.uuid_v7(),
  tenant_id uuid not null references tenants.empresa (id),
  reporte_id uuid not null,
  usuario_id uuid not null,
  creado_por uuid not null references tenants.usuario (id),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '72 hours'),
  revocado_en timestamptz,
  foreign key (tenant_id, reporte_id) references cumplimiento.reporte (tenant_id, id),
  foreign key (tenant_id, usuario_id) references tenants.usuario (tenant_id, id),
  check (expira_en > creado_en)
);

comment on table cumplimiento.acceso_inspector is 'Liga a un usuario con rol inspector con el único reporte que puede leer, con vencimiento.';

create index acceso_inspector_usuario_idx on cumplimiento.acceso_inspector (usuario_id);
