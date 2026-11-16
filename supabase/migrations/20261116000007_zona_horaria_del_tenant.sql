-- Zona horaria del tenant: define cuándo empieza y termina "el día" para el sello diario
-- (que se calcula a las 02:00 hora del tenant).

alter table tenants.empresa
  add column zona_horaria text not null default 'America/Mexico_City';

comment on column tenants.empresa.zona_horaria is 'Zona IANA del tenant; delimita el día del sello diario.';

create trigger empresa_valida_zona_horaria
  before insert or update of zona_horaria on tenants.empresa
  for each row execute function tenants.validar_zona_horaria();
