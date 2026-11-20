-- Días de gracia tras un cobro fallido antes de pasar la cuenta a solo lectura.
-- Para cambiarlo se cierra esta vigencia y se agrega una fila nueva.
-- Idempotente: la restricción de vigencias sin traslape descarta lo ya cargado.
insert into calculo.regla (clave, valor, unidad, vigente_desde, vigente_hasta, fuente)
values
  ('dias_gracia_pago', 7, 'dias', '2026-01-01', null, 'Política comercial de Mi Jornada')
on conflict do nothing;
