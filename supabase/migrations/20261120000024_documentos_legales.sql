-- Sprint 3, fase 0: documentos legales como plantillas versionadas.
--
--   * cumplimiento.plantilla: los textos base de Mi Jornada (docs/legal), por tipo y
--     versión. Se cargan con supabase/seeds/0002_plantillas_legales.sql.
--   * cumplimiento.documento guarda el texto de cada versión ya renderizado con los
--     datos de la empresa (contenido_md) y, en el aviso de privacidad, su resumen (el
--     aviso simplificado). contenido_hash es el SHA-256 de ese texto.
--   * Las variables del trabajador y de su centro ({{nombre_trabajador}},
--     {{#captura_foto}}…) se quedan en el texto y se resuelven al mostrarlo o
--     imprimirlo para cada persona.
--   * Una versión nunca se edita. Subir una versión nueva deja pendientes los
--     consentimientos: solo cuenta la aceptación de la versión vigente (la más alta).

create table cumplimiento.plantilla (
  tipo text not null check (tipo in ('convenio_registro', 'aviso_privacidad')),
  version text not null check (length(btrim(version)) > 0),
  contenido_md text not null check (length(btrim(contenido_md)) > 0),
  resumen_md text,
  creado_en timestamptz not null default now(),
  primary key (tipo, version)
);

comment on table cumplimiento.plantilla is 'Textos base de los documentos legales (docs/legal), con variables Mustache. No son de ningún tenant.';
comment on column cumplimiento.plantilla.resumen_md is 'Aviso de privacidad simplificado; solo en el tipo aviso_privacidad.';

alter table cumplimiento.plantilla enable row level security;
grant select on cumplimiento.plantilla to authenticated;
grant select, insert, update, delete on cumplimiento.plantilla to service_role;

create policy plantilla_lectura on cumplimiento.plantilla for select to authenticated using (true);

alter table cumplimiento.documento
  add column contenido_md text,
  add column resumen_md text,
  add column plantilla_version text,
  add column creado_por uuid references tenants.usuario (id);

comment on column cumplimiento.documento.contenido_md is 'Texto de esta versión, renderizado con los datos de la empresa. Las variables del trabajador y su centro se resuelven al mostrarlo.';
comment on column cumplimiento.documento.resumen_md is 'Aviso de privacidad simplificado de esta versión.';
comment on column cumplimiento.documento.plantilla_version is 'Versión de la plantilla de Mi Jornada de la que salió; nulo si el texto lo subió el patrón.';
comment on column cumplimiento.documento.url_pdf is 'Ruta en el bucket documentos del PDF para imprimir y firmar.';

-- Datos de la empresa que piden los documentos.
alter table tenants.empresa
  add column domicilio text,
  add column correo_privacidad text check (correo_privacidad is null or correo_privacidad ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column telefono_privacidad text,
  add column logo_url text;

comment on column tenants.empresa.domicilio is 'Domicilio del patrón, para el convenio y el aviso de privacidad.';
comment on column tenants.empresa.correo_privacidad is 'Contacto para derechos ARCO que aparece en el aviso de privacidad.';
comment on column tenants.empresa.logo_url is 'Ruta del logo en el bucket documentos; se usa en los PDF.';

grant update (domicilio, correo_privacidad, telefono_privacidad, logo_url) on tenants.empresa to authenticated;

-- PDF de documentos, firmas autógrafas escaneadas y logo: carpeta por tenant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy documentos_lectura on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and tenants.es_admin_de(((storage.foldername(name))[1])::uuid));

create policy documentos_subida on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and tenants.es_admin_de(((storage.foldername(name))[1])::uuid));
