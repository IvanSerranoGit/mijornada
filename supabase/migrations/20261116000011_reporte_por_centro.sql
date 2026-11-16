-- Un reporte puede limitarse a un centro de trabajo (null = todos los centros).
-- Lo necesita la política del supervisor: solo ve los reportes de su centro.

alter table cumplimiento.reporte
  add column centro_id uuid,
  add constraint reporte_tenant_id_centro_id_fkey
    foreign key (tenant_id, centro_id) references tenants.centro_trabajo (tenant_id, id);

comment on column cumplimiento.reporte.centro_id is 'Centro al que se limita el reporte; null si abarca todos los centros del tenant.';
