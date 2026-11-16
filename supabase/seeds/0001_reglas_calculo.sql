-- Calendario legal 2026-2030 y UMA 2026 (ver CLAUDE.md).
-- Idempotente: la restricción de vigencias sin traslape descarta lo ya cargado.

insert into calculo.regla (clave, valor, unidad, vigente_desde, vigente_hasta, fuente)
values
  -- Jornada máxima semanal: reducción gradual de 48 a 40 horas.
  ('jornada_max_semanal', 48, 'horas', '2026-01-01', '2026-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('jornada_max_semanal', 46, 'horas', '2027-01-01', '2027-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('jornada_max_semanal', 44, 'horas', '2028-01-01', '2028-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('jornada_max_semanal', 42, 'horas', '2029-01-01', '2029-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('jornada_max_semanal', 40, 'horas', '2030-01-01', null, 'LFT, calendario de reducción gradual de la jornada'),

  -- Tope semanal de tiempo extraordinario.
  ('tope_extra_semanal', 9, 'horas', '2026-01-01', '2027-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('tope_extra_semanal', 10, 'horas', '2028-01-01', '2028-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('tope_extra_semanal', 11, 'horas', '2029-01-01', '2029-12-31', 'LFT, calendario de reducción gradual de la jornada'),
  ('tope_extra_semanal', 12, 'horas', '2030-01-01', null, 'LFT, calendario de reducción gradual de la jornada'),

  -- Tope diario de tiempo extraordinario y de jornada total (ordinaria + extra).
  ('tope_extra_diario', 4, 'horas', '2026-01-01', null, 'LFT, calendario de reducción gradual de la jornada'),
  ('jornada_total_max_diaria', 12, 'horas', '2026-01-01', null, 'LFT, calendario de reducción gradual de la jornada'),

  -- En 2026 el tiempo extraordinario se permite como máximo 4 días por semana.
  ('dias_extra_max_semanal', 4, 'dias', '2026-01-01', '2026-12-31', 'LFT, calendario de reducción gradual de la jornada'),

  -- Menores de 18 años: sin tiempo extraordinario.
  ('tope_extra_semanal_menor', 0, 'horas', '2026-01-01', null, 'LFT, trabajo de menores de 18 años'),

  -- UMA diaria 2026 (vigente del 1 de febrero de 2026 al 31 de enero de 2027).
  ('uma_diaria', 117.31, 'pesos', '2026-02-01', '2027-01-31', 'INEGI, UMA 2026'),

  -- Multa por no llevar el registro electrónico de jornada.
  ('multa_registro_min', 250, 'uma', '2027-01-01', null, 'LFT art. 994 fr. IV Bis'),
  ('multa_registro_max', 5000, 'uma', '2027-01-01', null, 'LFT art. 994 fr. IV Bis')
on conflict do nothing;
