-- Plazo para reportar una incidencia (cláusula sexta del convenio de registro).
-- Provisional: la pregunta 9 de docs/preguntas-abogado.md puede cambiarlo. Para cambiarlo,
-- cierra esta vigencia (vigente_hasta) y agrega una fila nueva; nunca se edita el valor.
-- Idempotente: la restricción de vigencias sin traslape descarta lo ya cargado.
insert into calculo.regla (clave, valor, unidad, vigente_desde, vigente_hasta, fuente)
values
  ('dias_para_reportar_incidencia', 5, 'dias_habiles', '2026-01-01', null,
   'Convenio de registro de jornada, cláusula sexta (provisional)')
on conflict do nothing;
