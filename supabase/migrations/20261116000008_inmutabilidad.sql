-- Inmutabilidad en la base: jornada.evento y jornada.sello_diario solo aceptan INSERT.

create function jornada.impedir_modificacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% es inmutable: no se permite %.', tg_argv[0], tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function jornada.impedir_modificacion() is 'Rechaza UPDATE, DELETE y TRUNCATE sobre tablas append-only.';

-- El trigger por fila de la tabla particionada se hereda a todas sus particiones,
-- presentes y futuras.
create trigger evento_inmutable
  before update or delete on jornada.evento
  for each row execute function jornada.impedir_modificacion('jornada.evento');

create trigger evento_sin_truncate
  before truncate on jornada.evento
  for each statement execute function jornada.impedir_modificacion('jornada.evento');

create trigger sello_diario_inmutable
  before update or delete on jornada.sello_diario
  for each row execute function jornada.impedir_modificacion('jornada.sello_diario');

create trigger sello_diario_sin_truncate
  before truncate on jornada.sello_diario
  for each statement execute function jornada.impedir_modificacion('jornada.sello_diario');

-- TRUNCATE directo sobre una partición no dispara el trigger de la tabla madre:
-- cada partición lleva el suyo, las existentes y las que se creen después.
create or replace function jornada.crear_particion_evento(p_mes date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nombre text := 'evento_' || to_char(v_inicio, 'YYYY_MM');
begin
  execute format(
    'create table if not exists jornada.%I partition of jornada.evento for values from (%L) to (%L)',
    v_nombre,
    v_inicio::text || ' 00:00:00+00',
    v_fin::text || ' 00:00:00+00'
  );
  execute format(
    'create or replace trigger evento_sin_truncate before truncate on jornada.%I '
    'for each statement execute function jornada.impedir_modificacion(%L)',
    v_nombre,
    'jornada.evento'
  );
  return v_nombre;
end;
$$;

do $$
declare
  v_particion regclass;
begin
  for v_particion in
    select inhrelid::regclass from pg_catalog.pg_inherits where inhparent = 'jornada.evento'::regclass
  loop
    execute format(
      'create or replace trigger evento_sin_truncate before truncate on %s '
      'for each statement execute function jornada.impedir_modificacion(%L)',
      v_particion,
      'jornada.evento'
    );
  end loop;
end;
$$;
