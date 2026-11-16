-- Esquemas por dominio, extensiones y utilidades compartidas.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron;

create schema if not exists tenants;
create schema if not exists jornada;
create schema if not exists calculo;
create schema if not exists cumplimiento;
create schema if not exists integraciones;
create schema if not exists auditoria;

comment on schema tenants is 'Empresas, centros de trabajo, usuarios, trabajadores y horarios.';
comment on schema jornada is 'Bitácora inmutable de eventos de jornada, días laborales derivados y sellos diarios.';
comment on schema calculo is 'Reglas con vigencia y resúmenes de horas por periodo.';
comment on schema cumplimiento is 'Documentos, consentimientos, incidencias y reportes para inspección.';
comment on schema integraciones is 'Conectores hacia nóminas y terceros, e historial de exportaciones.';
comment on schema auditoria is 'Bitácora de cambios administrativos.';

-- UUID v7 (ordenable por tiempo). Postgres 17 no lo trae de fábrica: se toma un
-- UUID v4 aleatorio, se sobreescriben los primeros 48 bits con los milisegundos
-- Unix y se ajusta la versión a 7.
create or replace function public.uuid_v7()
returns uuid
language sql
volatile
parallel safe
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

comment on function public.uuid_v7() is 'Genera un UUID v7 (48 bits de tiempo Unix en ms + aleatorio).';
