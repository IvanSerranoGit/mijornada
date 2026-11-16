-- RLS en todas las tablas. Lo que no tiene política o permiso queda denegado.
--
-- Resumen por rol (claim `rol` del JWT):
--   dueno          todo en su tenant
--   administrador  igual que el dueño, salvo plan y estado de la empresa
--   despacho       administrador de los tenants que lo autorizaron
--   supervisor     lee lo de su centro y resuelve sus incidencias
--   empleado       marca, lee lo propio, abre incidencias y acepta documentos
--   kiosco         solo inserta eventos de marcaje de su centro
--   inspector      solo lee el reporte de su acceso vigente
--
-- El rol de servicio (jobs del servidor) se salta RLS, pero ni él puede hacer
-- UPDATE o DELETE sobre jornada.evento ni jornada.sello_diario.

grant usage on schema tenants, jornada, calculo, cumplimiento, integraciones, auditoria
  to authenticated, service_role;

grant select, insert, update, delete on all tables in schema tenants, calculo, cumplimiento, integraciones, auditoria
  to service_role;
grant select, insert, update, delete on jornada.dia_laboral to service_role;
grant select, insert on jornada.evento, jornada.sello_diario to service_role;
revoke update, delete, truncate on jornada.evento, jornada.sello_diario from service_role;

do $$
declare
  v_tabla regclass;
begin
  for v_tabla in
    select c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('tenants', 'jornada', 'calculo', 'cumplimiento', 'integraciones', 'auditoria')
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %s enable row level security', v_tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- tenants

-- empresa
grant select on tenants.empresa to authenticated;
grant update (razon_social, rfc, tamano, jurisdiccion, sector, plan, estado, zona_horaria)
  on tenants.empresa to authenticated;

create policy empresa_lectura on tenants.empresa for select to authenticated
  using (
    tenants.es_admin_de(id)
    or (id = tenants.jwt_tenant_id() and tenants.jwt_rol() in ('supervisor', 'empleado'))
  );

create policy empresa_edicion on tenants.empresa for update to authenticated
  using (tenants.es_admin_de(id))
  with check (tenants.es_admin_de(id));

-- centro_trabajo
grant select, insert, update on tenants.centro_trabajo to authenticated;

create policy centro_lectura on tenants.centro_trabajo for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or tenants.es_supervisor_de_centro(tenant_id, id)
    or (
      tenants.jwt_rol() = 'empleado'
      and tenant_id = tenants.jwt_tenant_id()
      and id = tenants.centro_de_trabajador(tenants.jwt_trabajador_id())
    )
  );

create policy centro_alta on tenants.centro_trabajo for insert to authenticated
  with check (tenants.es_admin_de(tenant_id));

create policy centro_edicion on tenants.centro_trabajo for update to authenticated
  using (tenants.es_admin_de(tenant_id))
  with check (tenants.es_admin_de(tenant_id));

-- trabajador: pin_hash, curp_cifrado y nss_cifrado solo los maneja el servidor.
grant select (id, tenant_id, centro_id, nombre, puesto, fecha_alta, fecha_baja, tipo_jornada, menor_de_edad, metodo_marcaje, creado_en)
  on tenants.trabajador to authenticated;
grant insert (id, tenant_id, centro_id, nombre, puesto, fecha_alta, fecha_baja, tipo_jornada, menor_de_edad, metodo_marcaje)
  on tenants.trabajador to authenticated;
grant update (centro_id, nombre, puesto, fecha_alta, fecha_baja, tipo_jornada, menor_de_edad, metodo_marcaje)
  on tenants.trabajador to authenticated;

create policy trabajador_lectura on tenants.trabajador for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or tenants.es_supervisor_de_centro(tenant_id, centro_id)
    or (
      tenants.jwt_rol() = 'empleado'
      and tenant_id = tenants.jwt_tenant_id()
      and id = tenants.jwt_trabajador_id()
    )
  );

create policy trabajador_alta on tenants.trabajador for insert to authenticated
  with check (tenants.es_admin_de(tenant_id));

create policy trabajador_edicion on tenants.trabajador for update to authenticated
  using (tenants.es_admin_de(tenant_id))
  with check (tenants.es_admin_de(tenant_id));

-- usuario: cada quien ve su propio registro; solo el dueño administra a otro dueño.
grant select, insert on tenants.usuario to authenticated;
grant update (rol, centro_id, trabajador_id, activo) on tenants.usuario to authenticated;

create policy usuario_lectura on tenants.usuario for select to authenticated
  using (tenants.es_admin_de(tenant_id) or auth_user_id = (select auth.uid()));

create policy usuario_alta on tenants.usuario for insert to authenticated
  with check (
    tenants.es_admin_de(tenant_id)
    and (rol <> 'dueno' or tenants.es_dueno_de(tenant_id))
  );

create policy usuario_edicion on tenants.usuario for update to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    and (rol <> 'dueno' or tenants.es_dueno_de(tenant_id))
  )
  with check (
    tenants.es_admin_de(tenant_id)
    and (rol <> 'dueno' or tenants.es_dueno_de(tenant_id))
  );

-- El hook de Supabase Auth necesita leer usuarios para armar los claims.
create policy usuario_lectura_auth on tenants.usuario for select to supabase_auth_admin
  using (true);

-- horario
grant select, insert on tenants.horario to authenticated;
grant update (vigente_hasta) on tenants.horario to authenticated;

create policy horario_lectura on tenants.horario for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

create policy horario_alta on tenants.horario for insert to authenticated
  with check (tenants.es_admin_de(tenant_id));

-- Un horario no se sobreescribe: solo se cierra su vigencia.
create policy horario_cierre on tenants.horario for update to authenticated
  using (tenants.es_admin_de(tenant_id))
  with check (tenants.es_admin_de(tenant_id));

-- despacho_autorizacion: la otorga y la revoca el dueño del tenant.
grant select, insert on tenants.despacho_autorizacion to authenticated;
grant update (revocado_en) on tenants.despacho_autorizacion to authenticated;

create policy despacho_autorizacion_lectura on tenants.despacho_autorizacion for select to authenticated
  using (
    (tenant_id = tenants.jwt_tenant_id() and tenants.jwt_rol() in ('dueno', 'administrador'))
    or (despacho_id = tenants.jwt_tenant_id() and tenants.jwt_rol() in ('dueno', 'administrador', 'despacho'))
  );

create policy despacho_autorizacion_alta on tenants.despacho_autorizacion for insert to authenticated
  with check (tenants.es_dueno_de(tenant_id) and autorizado_por = tenants.jwt_usuario_id());

create policy despacho_autorizacion_revocacion on tenants.despacho_autorizacion for update to authenticated
  using (tenants.es_dueno_de(tenant_id))
  with check (tenants.es_dueno_de(tenant_id));

-- ---------------------------------------------------------------- jornada

-- evento: sin UPDATE ni DELETE para nadie. Las correcciones las inserta el servidor.
grant select, insert on jornada.evento to authenticated;

create policy evento_lectura on jornada.evento for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

-- El kiosco marca por los trabajadores de su centro; el empleado, por sí mismo.
create policy evento_marcaje on jornada.evento for insert to authenticated
  with check (
    tenant_id = tenants.jwt_tenant_id()
    and creado_por = tenants.jwt_usuario_id()
    and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
    and referencia_evento_id is null
    and (
      (
        tenants.jwt_rol() = 'kiosco'
        and origen = 'kiosco'
        and tenants.centro_de_trabajador(trabajador_id) = tenants.jwt_centro_id()
      )
      or (
        tenants.jwt_rol() = 'empleado'
        and origen = 'pwa'
        and trabajador_id = tenants.jwt_trabajador_id()
      )
    )
  );

-- dia_laboral: derivada, solo lectura para los clientes.
grant select on jornada.dia_laboral to authenticated;

create policy dia_laboral_lectura on jornada.dia_laboral for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

-- sello_diario: solo lectura.
grant select on jornada.sello_diario to authenticated;

create policy sello_diario_lectura on jornada.sello_diario for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or (tenant_id = tenants.jwt_tenant_id() and tenants.jwt_rol() = 'supervisor')
  );

-- ---------------------------------------------------------------- calculo

-- regla: catálogo global de solo lectura; solo Inzotec lo escribe (migraciones y seeds).
grant select on calculo.regla to authenticated;

create policy regla_lectura on calculo.regla for select to authenticated
  using (tenants.jwt_rol() is distinct from 'inspector' and tenants.jwt_rol() is distinct from 'kiosco');

grant select on calculo.resumen_periodo to authenticated;

create policy resumen_periodo_lectura on calculo.resumen_periodo for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

-- ---------------------------------------------------------------- cumplimiento

-- documento: versionado, nunca se edita.
grant select, insert on cumplimiento.documento to authenticated;

create policy documento_lectura on cumplimiento.documento for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or (tenant_id = tenants.jwt_tenant_id() and tenants.jwt_rol() in ('supervisor', 'empleado'))
  );

create policy documento_alta on cumplimiento.documento for insert to authenticated
  with check (tenants.es_admin_de(tenant_id));

-- consentimiento: lo acepta el propio trabajador, o el patrón sube la firma autógrafa.
grant select, insert on cumplimiento.consentimiento to authenticated;

create policy consentimiento_lectura on cumplimiento.consentimiento for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

create policy consentimiento_alta on cumplimiento.consentimiento for insert to authenticated
  with check (
    (tenants.es_admin_de(tenant_id) and metodo = 'firma_autografa')
    or (
      tenants.jwt_rol() = 'empleado'
      and tenant_id = tenants.jwt_tenant_id()
      and trabajador_id = tenants.jwt_trabajador_id()
      and metodo in ('clic', 'firma_simple')
    )
  );

-- incidencia: la abre el trabajador, el supervisor o un administrador;
-- la resuelve un administrador o el supervisor del centro.
grant select, insert on cumplimiento.incidencia to authenticated;
grant update (estado, resuelto_por, resuelto_en) on cumplimiento.incidencia to authenticated;

create policy incidencia_lectura on cumplimiento.incidencia for select to authenticated
  using (tenants.puede_ver_trabajador(tenant_id, trabajador_id));

create policy incidencia_alta on cumplimiento.incidencia for insert to authenticated
  with check (
    tenants.puede_ver_trabajador(tenant_id, trabajador_id)
    and estado = 'pendiente'
    and solicitado_por = tenants.jwt_usuario_id()
  );

create policy incidencia_resolucion on cumplimiento.incidencia for update to authenticated
  using (
    estado = 'pendiente'
    and (
      tenants.es_admin_de(tenant_id)
      or tenants.es_supervisor_de_centro(tenant_id, tenants.centro_de_trabajador(trabajador_id))
    )
  )
  with check (
    estado in ('aprobada', 'rechazada')
    and resuelto_por = tenants.jwt_usuario_id()
  );

-- reporte: lo genera el servidor; aquí solo se lee.
grant select on cumplimiento.reporte to authenticated;

create policy reporte_lectura on cumplimiento.reporte for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or (centro_id is not null and tenants.es_supervisor_de_centro(tenant_id, centro_id))
    or cumplimiento.inspector_puede_ver_reporte(tenant_id, id)
  );

-- acceso_inspector
grant select, insert on cumplimiento.acceso_inspector to authenticated;
grant update (revocado_en) on cumplimiento.acceso_inspector to authenticated;

create policy acceso_inspector_lectura on cumplimiento.acceso_inspector for select to authenticated
  using (
    tenants.es_admin_de(tenant_id)
    or (
      tenants.jwt_rol() = 'inspector'
      and tenant_id = tenants.jwt_tenant_id()
      and usuario_id = tenants.jwt_usuario_id()
    )
  );

create policy acceso_inspector_alta on cumplimiento.acceso_inspector for insert to authenticated
  with check (tenants.es_admin_de(tenant_id) and creado_por = tenants.jwt_usuario_id());

create policy acceso_inspector_revocacion on cumplimiento.acceso_inspector for update to authenticated
  using (tenants.es_admin_de(tenant_id))
  with check (tenants.es_admin_de(tenant_id));

-- ---------------------------------------------------------------- integraciones

-- conector: config_cifrada solo la maneja el servidor.
grant select (id, tenant_id, tipo, activo, creado_en) on integraciones.conector to authenticated;
grant insert (id, tenant_id, tipo, activo) on integraciones.conector to authenticated;
grant update (activo) on integraciones.conector to authenticated;

create policy conector_lectura on integraciones.conector for select to authenticated
  using (tenants.es_admin_de(tenant_id));

create policy conector_alta on integraciones.conector for insert to authenticated
  with check (tenants.es_admin_de(tenant_id));

create policy conector_edicion on integraciones.conector for update to authenticated
  using (tenants.es_admin_de(tenant_id))
  with check (tenants.es_admin_de(tenant_id));

grant select on integraciones.exportacion to authenticated;

create policy exportacion_lectura on integraciones.exportacion for select to authenticated
  using (tenants.es_admin_de(tenant_id));

-- ---------------------------------------------------------------- auditoria

-- bitacora_admin: la escribe el servidor; los administradores la leen.
grant select on auditoria.bitacora_admin to authenticated;

create policy bitacora_admin_lectura on auditoria.bitacora_admin for select to authenticated
  using (tenants.es_admin_de(tenant_id));
