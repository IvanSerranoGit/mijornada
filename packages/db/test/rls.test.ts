// RLS: aislamiento entre tenants y permisos por rol.
import { afterAll, describe, expect, it } from "vitest";
import {
  asRole,
  asUser,
  createTenant,
  expectPgError,
  inRollback,
  insertEvent,
  sql,
  testId,
  type Claims,
  type Tenant,
  type Tx,
} from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

/** Todas las tablas con tenant_id. */
const TENANT_TABLES = [
  "tenants.centro_trabajo",
  "tenants.trabajador",
  "tenants.usuario",
  "tenants.horario",
  "tenants.despacho_autorizacion",
  "jornada.evento",
  "jornada.dia_laboral",
  "jornada.sello_diario",
  "calculo.resumen_periodo",
  "cumplimiento.documento",
  "cumplimiento.consentimiento",
  "cumplimiento.incidencia",
  "cumplimiento.reporte",
  "cumplimiento.acceso_inspector",
  "integraciones.conector",
  "integraciones.exportacion",
  "auditoria.bitacora_admin",
] as const;

interface Seeded extends Tenant {
  reporteId: string;
  reporteCentroA: string;
  incidenciaA: string;
  incidenciaB: string;
  eventoA: string;
  eventoB: string;
}

/** Tenant con al menos una fila en cada tabla. `despachoId` es otra empresa cualquiera. */
async function seedTenant(tx: Tx, nombre: string): Promise<Seeded> {
  const t = await createTenant(tx, nombre);
  const id = t.tenantId;
  const owner = t.dueno.usuario_id;
  const [documentoId, reporteId, reporteCentroA, conectorId, incidenciaA, incidenciaB, despachoId] =
    [testId(), testId(), testId(), testId(), testId(), testId(), testId()];
  const hash = "a".repeat(64);

  const eventoA = await insertEvent(tx, t, t.trabajadorA);
  const eventoB = await insertEvent(tx, t, t.trabajadorB);
  await insertEvent(tx, t, t.trabajadorA2);

  await tx`insert into tenants.horario (tenant_id, trabajador_id, vigente_desde, dias, hora_entrada, hora_salida)
           values (${id}, ${t.trabajadorA}, '2026-01-01', '[1,2,3,4,5]', '09:00', '18:00'),
                  (${id}, ${t.trabajadorB}, '2026-01-01', '[1,2,3,4,5]', '09:00', '18:00')`;
  await tx`insert into tenants.empresa (id, razon_social, tamano, jurisdiccion, es_despacho)
           values (${despachoId}, ${`Despacho de ${nombre}`}, 'micro', 'local', true)`;
  await tx`insert into tenants.despacho_autorizacion (tenant_id, despacho_id, autorizado_por, revocado_en)
           values (${id}, ${despachoId}, ${owner}, now())`;
  await tx`insert into jornada.dia_laboral (tenant_id, trabajador_id, fecha, estado)
           values (${id}, ${t.trabajadorA}, '2026-11-02', 'completo'), (${id}, ${t.trabajadorB}, '2026-11-02', 'completo')`;
  await tx`insert into jornada.sello_diario (tenant_id, fecha, hash_raiz, n_eventos) values (${id}, '2026-11-02', ${hash}, 0)`;
  await tx`insert into calculo.resumen_periodo (tenant_id, trabajador_id, periodo_inicio, periodo_fin)
           values (${id}, ${t.trabajadorA}, '2026-11-02', '2026-11-08'), (${id}, ${t.trabajadorB}, '2026-11-02', '2026-11-08')`;
  await tx`insert into cumplimiento.documento (id, tenant_id, tipo, version, contenido_hash, vigente_desde)
           values (${documentoId}, ${id}, 'convenio_registro', 1, ${hash}, '2026-01-01')`;
  await tx`insert into cumplimiento.consentimiento (tenant_id, trabajador_id, documento_id, metodo)
           values (${id}, ${t.trabajadorA}, ${documentoId}, 'clic'), (${id}, ${t.trabajadorB}, ${documentoId}, 'clic')`;
  await tx`insert into cumplimiento.incidencia
             (id, tenant_id, trabajador_id, fecha, tipo, motivo, solicitado_por, tipo_marcaje, ts_declarado)
           values (${incidenciaA}, ${id}, ${t.trabajadorA}, '2026-11-02', 'olvido', 'Olvidó marcar', ${owner},
                   'salida', '2026-11-02T18:00:00-06:00'),
                  (${incidenciaB}, ${id}, ${t.trabajadorB}, '2026-11-02', 'olvido', 'Olvidó marcar', ${owner},
                   'salida', '2026-11-02T18:00:00-06:00')`;
  await tx`insert into cumplimiento.reporte (id, tenant_id, tipo, rango, hash_contenido, solicitante, centro_id)
           values (${reporteId}, ${id}, 'inspeccion', '[2026-11-01,2026-12-01)', ${hash}, ${owner}, null),
                  (${reporteCentroA}, ${id}, 'periodo', '[2026-11-01,2026-12-01)', ${hash}, ${owner}, ${t.centroA})`;
  await tx`insert into cumplimiento.acceso_inspector (tenant_id, reporte_id, usuario_id, creado_por)
           values (${id}, ${reporteId}, ${t.inspector.usuario_id}, ${owner})`;
  await tx`insert into integraciones.conector (id, tenant_id, tipo) values (${conectorId}, ${id}, 'webhook')`;
  await tx`insert into integraciones.exportacion (tenant_id, conector_id, periodo, formato)
           values (${id}, ${conectorId}, '[2026-11-01,2026-12-01)', 'csv')`;
  await tx`insert into auditoria.bitacora_admin (tenant_id, usuario_id, accion, entidad)
           values (${id}, ${owner}, 'alta', 'trabajador')`;

  return { ...t, reporteId, reporteCentroA, incidenciaA, incidenciaB, eventoA, eventoB };
}

/** tenant_id de las filas que el usuario alcanza a ver en una tabla. */
async function visibleTenants(tx: Tx, table: string): Promise<string[]> {
  const rows = await tx.unsafe<{ tenant_id: string }[]>(`select tenant_id from ${table}`);
  return rows.map((row) => row.tenant_id);
}

async function countRows(tx: Tx, table: string): Promise<number> {
  const [row] = await tx.unsafe<{ n: string }[]>(`select count(*) as n from ${table}`);
  return Number(row?.n);
}

const insertMark =
  (tenantId: string, trabajadorId: string, claims: Claims, origen: string) => (tx: Tx) => tx`
  insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por)
  values (${tenantId}, ${trabajadorId}, 'entrada', ${origen}, ${claims.usuario_id})`;

describe("aislamiento entre tenants", () => {
  it("el dueño de un tenant ve lo suyo en todas las tablas y nada del otro", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const dos = await seedTenant(tx, "Dos");

      for (const [propio, ajeno] of [
        [uno, dos],
        [dos, uno],
      ] as const) {
        await asUser(tx, propio.dueno, async () => {
          for (const table of TENANT_TABLES) {
            const tenants = await visibleTenants(tx, table);
            expect(tenants.length, `${table}: el dueño debe ver sus filas`).toBeGreaterThan(0);
            expect(new Set(tenants), `${table}: no debe ver filas de otro tenant`).toEqual(
              new Set([propio.tenantId]),
            );
          }
          const empresas = await tx<{ id: string }[]>`select id from tenants.empresa`;
          expect(empresas.map((e) => e.id)).toEqual([propio.tenantId]);
          expect(empresas.map((e) => e.id)).not.toContain(ajeno.tenantId);
        });
      }
    });
  });

  it("el dueño de un tenant no puede escribir en el otro", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const dos = await seedTenant(tx, "Dos");

      await asUser(tx, uno.dueno, async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into tenants.centro_trabajo (tenant_id, nombre, zona_horaria)
            values (${dos.tenantId}, 'Intruso', 'America/Mexico_City')`,
          ),
        ).toMatch(/row-level security/);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into tenants.trabajador (tenant_id, centro_id, nombre)
            values (${dos.tenantId}, ${dos.centroA}, 'Intruso')`,
          ),
        ).toMatch(/row-level security/);

        const updated =
          await tx`update tenants.trabajador set nombre = 'Alterado' where tenant_id = ${dos.tenantId}`;
        expect(updated.count).toBe(0);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`select cumplimiento.resolver_incidencia(${dos.incidenciaA}, true)`,
          ),
        ).toMatch(/no puedes resolverla/);
      });

      const [row] = await tx<
        { nombre: string }[]
      >`select nombre from tenants.trabajador where id = ${dos.trabajadorA}`;
      expect(row?.nombre).toBe("Ana");
    });
  });

  it("sin sesión (anon) no hay acceso; con sesión sin claims no se ve nada", async () => {
    await inRollback(async (tx) => {
      await seedTenant(tx, "Uno");

      await asRole(tx, "anon", async () => {
        for (const table of [...TENANT_TABLES, "tenants.empresa", "calculo.regla"]) {
          expect(
            await expectPgError(tx, (sp) => sp.unsafe(`select 1 from ${table}`)),
            table,
          ).toMatch(/permission denied/);
        }
      });

      await tx`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`;
      await tx`set local role authenticated`;
      for (const table of TENANT_TABLES) {
        expect(await countRows(tx, table), table).toBe(0);
      }
      expect(await countRows(tx, "tenants.empresa")).toBe(0);
      await tx`reset role`;
    });
  });

  it("nadie puede hacer UPDATE ni DELETE sobre jornada.evento", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      await asUser(tx, uno.dueno, async () => {
        expect(
          await expectPgError(tx, (sp) => sp`update jornada.evento set tipo = 'salida'`),
        ).toMatch(/permission denied/);
        expect(await expectPgError(tx, (sp) => sp`delete from jornada.evento`)).toMatch(
          /permission denied/,
        );
      });
    });
  });
});

describe("permisos por rol", () => {
  it("el administrador administra el tenant, pero nadie cambia el plan desde la API ni él crea dueños", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");

      await asUser(tx, uno.administrador, async () => {
        await tx`insert into tenants.centro_trabajo (tenant_id, nombre, zona_horaria)
                 values (${uno.tenantId}, 'Sucursal', 'America/Monterrey')`;
        await tx`update tenants.empresa set razon_social = 'Uno, S.A.' where id = ${uno.tenantId}`;

        expect(
          await expectPgError(
            tx,
            (sp) => sp`update tenants.empresa set plan = 'negocio' where id = ${uno.tenantId}`,
          ),
        ).toMatch(/permission denied/);

        const sub = uno.empleadoA.sub ?? "";
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into tenants.usuario (tenant_id, auth_user_id, rol) values (${uno.tenantId}, ${sub}, 'dueno')`,
          ),
        ).toMatch(/row-level security|duplicate key/);
        const demoted =
          await tx`update tenants.usuario set activo = false where id = ${uno.dueno.usuario_id}`;
        expect(demoted.count).toBe(0);
      });

      // El plan lo fija el cobro (webhook de Stripe, en el servidor): tampoco el dueño lo cambia.
      await asUser(tx, uno.dueno, async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`update tenants.empresa set plan = 'negocio' where id = ${uno.tenantId}`,
          ),
        ).toMatch(/permission denied/);
      });
    });
  });

  it("los clientes no pueden leer pin_hash, CURP, NSS ni la configuración de conectores", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      await asUser(tx, uno.dueno, async () => {
        for (const query of [
          "select pin_hash from tenants.trabajador",
          "select curp_cifrado from tenants.trabajador",
          "select nss_cifrado from tenants.trabajador",
          "select config_cifrada from integraciones.conector",
          `select tenants.descifrar('${uno.tenantId}', null)`,
        ]) {
          expect(await expectPgError(tx, (sp) => sp.unsafe(query)), query).toMatch(
            /permission denied/,
          );
        }
      });
    });
  });

  it("el supervisor solo ve y resuelve lo de su centro", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      await seedTenant(tx, "Dos");

      await asUser(tx, uno.supervisorA, async () => {
        const eventos = await tx<
          { trabajador_id: string }[]
        >`select trabajador_id from jornada.evento`;
        expect(new Set(eventos.map((e) => e.trabajador_id))).toEqual(
          new Set([uno.trabajadorA, uno.trabajadorA2]),
        );

        const trabajadores = await tx<{ id: string }[]>`select id from tenants.trabajador`;
        expect(new Set(trabajadores.map((t) => t.id))).toEqual(
          new Set([uno.trabajadorA, uno.trabajadorA2]),
        );

        const reportes = await tx<{ id: string }[]>`select id from cumplimiento.reporte`;
        expect(reportes.map((r) => r.id)).toEqual([uno.reporteCentroA]);

        const resolve = (incidenciaId: string) => (sp: Tx) =>
          sp`select cumplimiento.resolver_incidencia(${incidenciaId}, true)`;
        await resolve(uno.incidenciaA)(tx);
        expect(await expectPgError(tx, resolve(uno.incidenciaB))).toMatch(/no puedes resolverla/);
        expect(await expectPgError(tx, resolve(uno.incidenciaA))).toMatch(/ya fue resuelta/);

        expect(await countRows(tx, "integraciones.conector")).toBe(0);
        expect(await countRows(tx, "auditoria.bitacora_admin")).toBe(0);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into tenants.trabajador (tenant_id, centro_id, nombre) values (${uno.tenantId}, ${uno.centroA}, 'Nuevo')`,
          ),
        ).toMatch(/row-level security/);
      });
    });
  });

  it("el empleado marca por sí mismo y solo ve lo propio", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const dos = await seedTenant(tx, "Dos");
      const yo = uno.empleadoA;

      await asUser(tx, yo, async () => {
        await insertMark(uno.tenantId, uno.trabajadorA, yo, "pwa")(tx);

        const eventos = await tx<
          { trabajador_id: string }[]
        >`select trabajador_id from jornada.evento`;
        expect(eventos).toHaveLength(2);
        expect(new Set(eventos.map((e) => e.trabajador_id))).toEqual(new Set([uno.trabajadorA]));

        expect((await tx`select id from tenants.trabajador`).map((t) => t["id"] as string)).toEqual(
          [uno.trabajadorA],
        );
        expect(await countRows(tx, "cumplimiento.consentimiento")).toBe(1);
        expect(await countRows(tx, "cumplimiento.incidencia")).toBe(1);
        expect(await countRows(tx, "cumplimiento.reporte")).toBe(0);
        expect(await countRows(tx, "tenants.usuario")).toBe(1);

        // No puede marcar por otro, ni con otro origen, ni en otro tenant, ni corregir.
        for (const attempt of [
          insertMark(uno.tenantId, uno.trabajadorA2, yo, "pwa"),
          insertMark(uno.tenantId, uno.trabajadorA, yo, "kiosco"),
          insertMark(uno.tenantId, uno.trabajadorA, uno.dueno, "pwa"),
          insertMark(dos.tenantId, dos.trabajadorA, yo, "pwa"),
          (sp: Tx) => sp`
            insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id)
            values (${uno.tenantId}, ${uno.trabajadorA}, 'correccion', 'pwa', ${yo.usuario_id}, 'Yo me corrijo', ${uno.eventoA})`,
        ]) {
          expect(await expectPgError(tx, attempt)).toMatch(/row-level security/);
        }

        await tx`insert into cumplimiento.incidencia (tenant_id, trabajador_id, fecha, tipo, motivo, solicitado_por)
                 values (${uno.tenantId}, ${uno.trabajadorA}, '2026-11-03', 'permiso', 'Cita médica', ${yo.usuario_id})`;
        // No puede aprobarse a sí mismo: ni por la función ni cambiando el estado directo.
        const [mia] = await tx<{ id: string }[]>`
          select id from cumplimiento.incidencia where solicitado_por = ${yo.usuario_id}`;
        expect(
          await expectPgError(
            tx,
            (sp) => sp`select cumplimiento.resolver_incidencia(${mia?.id ?? ""}, true)`,
          ),
        ).toMatch(/no puedes resolverla/);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`update cumplimiento.incidencia set estado = 'aprobada'`,
          ),
        ).toMatch(/permission denied/);
      });
    });
  });

  it("el kiosco solo inserta eventos de su centro y no lee datos del negocio", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const dos = await seedTenant(tx, "Dos");
      const kiosco = uno.kioscoA;

      await asUser(tx, kiosco, async () => {
        await insertMark(uno.tenantId, uno.trabajadorA, kiosco, "kiosco")(tx);
        await insertMark(uno.tenantId, uno.trabajadorA2, kiosco, "kiosco")(tx);

        for (const attempt of [
          insertMark(uno.tenantId, uno.trabajadorB, kiosco, "kiosco"),
          insertMark(dos.tenantId, dos.trabajadorA, kiosco, "kiosco"),
          insertMark(uno.tenantId, uno.trabajadorA, kiosco, "api"),
          insertMark(uno.tenantId, uno.trabajadorA, uno.dueno, "kiosco"),
        ]) {
          expect(await expectPgError(tx, attempt)).toMatch(/row-level security/);
        }

        // Lo único que lee es su propio registro de usuario.
        expect(await countRows(tx, "tenants.usuario")).toBe(1);
        for (const table of [...TENANT_TABLES, "tenants.empresa", "calculo.regla"]) {
          if (table === "tenants.usuario") continue;
          expect(await countRows(tx, table), `${table}: el kiosco no debe leer`).toBe(0);
        }
      });

      // Los dos marcajes entraron y quedaron encadenados al evento previo de cada trabajador.
      const eventos = await tx<{ origen: string; encadenado: boolean }[]>`
        select origen, hash_prev is not null as encadenado from jornada.evento
        where tenant_id = ${uno.tenantId} and origen = 'kiosco'`;
      expect(eventos).toEqual([
        { origen: "kiosco", encadenado: true },
        { origen: "kiosco", encadenado: true },
      ]);
    });
  });

  it("el inspector solo lee el reporte de su acceso vigente", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      await seedTenant(tx, "Dos");
      const reportes = () => tx<{ id: string }[]>`select id from cumplimiento.reporte`;

      await asUser(tx, uno.inspector, async () => {
        expect((await reportes()).map((r) => r.id)).toEqual([uno.reporteId]);
        expect(await countRows(tx, "cumplimiento.acceso_inspector")).toBe(1);
        for (const table of TENANT_TABLES.filter(
          (t) =>
            t !== "cumplimiento.reporte" &&
            t !== "cumplimiento.acceso_inspector" &&
            t !== "tenants.usuario",
        )) {
          expect(await countRows(tx, table), `${table}: el inspector no debe leer`).toBe(0);
        }
        expect(await countRows(tx, "tenants.empresa")).toBe(0);
        const updated = await tx`update cumplimiento.acceso_inspector set revocado_en = null`;
        expect(updated.count).toBe(0);
      });

      // Vencido (72 h) o revocado, ya no ve nada.
      await tx`update cumplimiento.acceso_inspector
               set creado_en = now() - interval '73 hours', expira_en = now() - interval '1 hour'
               where tenant_id = ${uno.tenantId}`;
      await asUser(tx, uno.inspector, async () => {
        expect(await reportes()).toEqual([]);
      });

      await tx`update cumplimiento.acceso_inspector
               set expira_en = now() + interval '1 hour', revocado_en = now() where tenant_id = ${uno.tenantId}`;
      await asUser(tx, uno.inspector, async () => {
        expect(await reportes()).toEqual([]);
      });
    });
  });

  it("el despacho administra solo los tenants que lo autorizaron, mientras no se revoque", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const dos = await seedTenant(tx, "Dos");

      const despachoId = testId();
      const sub = testId();
      const contador: Claims = {
        tenant_id: despachoId,
        rol: "despacho",
        usuario_id: testId(),
        sub,
      };
      await tx`insert into tenants.empresa (id, razon_social, tamano, jurisdiccion, es_despacho)
               values (${despachoId}, 'Despacho Contable', 'micro', 'local', true)`;
      await tx`insert into auth.users (id, email) values (${sub}, 'contador@prueba.test')`;
      await tx`insert into tenants.usuario (id, tenant_id, auth_user_id, rol)
               values (${contador.usuario_id}, ${despachoId}, ${sub}, 'despacho')`;

      const trabajadoresVisibles = () =>
        asUser(tx, contador, async () => new Set(await visibleTenants(tx, "tenants.trabajador")));

      expect(await trabajadoresVisibles()).toEqual(new Set());

      // El dueño de Uno autoriza al despacho; el de Dos no.
      await asUser(tx, uno.dueno, async () => {
        await tx`insert into tenants.despacho_autorizacion (tenant_id, despacho_id, autorizado_por)
                 values (${uno.tenantId}, ${despachoId}, ${uno.dueno.usuario_id})`;
      });
      await asUser(tx, uno.administrador, async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into tenants.despacho_autorizacion (tenant_id, despacho_id, autorizado_por)
            values (${uno.tenantId}, ${dos.tenantId}, ${uno.administrador.usuario_id})`,
          ),
        ).toMatch(/row-level security/);
      });

      expect(await trabajadoresVisibles()).toEqual(new Set([uno.tenantId]));
      await asUser(tx, contador, async () => {
        expect(new Set(await visibleTenants(tx, "jornada.evento"))).toEqual(
          new Set([uno.tenantId]),
        );
        const updated =
          await tx`update tenants.trabajador set puesto = 'Cajera' where id = ${uno.trabajadorA}`;
        expect(updated.count).toBe(1);
        const foreign =
          await tx`update tenants.trabajador set puesto = 'Cajera' where id = ${dos.trabajadorA}`;
        expect(foreign.count).toBe(0);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`update tenants.empresa set plan = 'negocio' where id = ${uno.tenantId}`,
          ),
        ).toMatch(/permission denied/);
      });

      await asUser(tx, uno.dueno, async () => {
        await tx`update tenants.despacho_autorizacion set revocado_en = now()
                 where tenant_id = ${uno.tenantId} and despacho_id = ${despachoId}`;
      });
      expect(await trabajadoresVisibles()).toEqual(new Set());
    });
  });
});

describe("claims del JWT", () => {
  it("el hook agrega tenant_id, rol, usuario_id, centro_id y trabajador_id", async () => {
    await inRollback(async (tx) => {
      const uno = await seedTenant(tx, "Uno");
      const claimsOf = async (who: Claims) => {
        const event = { user_id: who.sub, claims: { sub: who.sub, role: "authenticated" } };
        const [row] = await tx<{ claims: Record<string, unknown> }[]>`
          select tenants.claims_token_acceso(${tx.json(event)}) -> 'claims' as claims`;
        return row?.claims;
      };

      expect(await claimsOf(uno.supervisorA)).toEqual({
        sub: uno.supervisorA.sub,
        role: "authenticated",
        tenant_id: uno.tenantId,
        rol: "supervisor",
        usuario_id: uno.supervisorA.usuario_id,
        centro_id: uno.centroA,
        trabajador_id: null,
      });
      expect(await claimsOf(uno.empleadoA)).toMatchObject({
        rol: "empleado",
        trabajador_id: uno.trabajadorA,
      });

      // Un usuario desactivado ya no recibe claims.
      await tx`update tenants.usuario set activo = false where id = ${uno.empleadoA.usuario_id}`;
      expect(await claimsOf(uno.empleadoA)).toEqual({
        sub: uno.empleadoA.sub,
        role: "authenticated",
      });
    });
  });
});
