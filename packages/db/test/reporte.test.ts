// Sincronización tardía y verificación de integridad de un reporte.
import { afterAll, describe, expect, it } from "vitest";
import {
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

const mark =
  (t: Tenant, trabajadorId: string, who: Claims, origen: string, atraso: string) => (tx: Tx) => tx`
  insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo)
  values (${t.tenantId}, ${trabajadorId}, 'entrada', ${origen}, ${who.usuario_id}, now() - ${atraso}::interval)`;

async function origins(tx: Tx, t: Tenant): Promise<string[]> {
  const rows = await tx<{ origen: string }[]>`
    select origen from jornada.evento where tenant_id = ${t.tenantId} order by ts_servidor, id`;
  return rows.map((row) => row.origen);
}

describe("sincronización tardía", () => {
  it("marca como tardío el marcaje que llega más de 24 h después de la hora del dispositivo", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(t, t.trabajadorA, t.dueno, "api", "23 hours 59 minutes")(tx);
      await mark(t, t.trabajadorA, t.dueno, "api", "24 hours 1 minute")(tx);
      await mark(t, t.trabajadorA, t.dueno, "import", "30 days")(tx);
      expect(await origins(tx, t)).toEqual(["api", "sincronizacion_tardia", "import"]);

      const [row] = await tx<{ integra: boolean }[]>`
        select integra from jornada.verificar_cadena(${t.tenantId}, ${t.trabajadorA})`;
      expect(row?.integra).toBe(true);
    });
  });

  it("el kiosco y el empleado pueden sincronizar marcajes tardíos, pero no declararlos ellos", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");

      await asUser(tx, t.kioscoA, async () => {
        await mark(t, t.trabajadorA, t.kioscoA, "kiosco", "3 days")(tx);
        expect(
          await expectPgError(
            tx,
            mark(t, t.trabajadorA, t.kioscoA, "sincronizacion_tardia", "3 days"),
          ),
        ).toMatch(/lo asigna el servidor/);
      });
      await asUser(tx, t.empleadoA, async () => {
        await mark(t, t.trabajadorA, t.empleadoA, "pwa", "2 days")(tx);
        await mark(t, t.trabajadorA, t.empleadoA, "pwa", "1 minute")(tx);
      });

      expect(await origins(tx, t)).toEqual([
        "sincronizacion_tardia",
        "sincronizacion_tardia",
        "pwa",
      ]);
    });
  });
});

interface Fila {
  trabajador_id: string;
  integra: boolean;
  n_eventos: string;
  evento_roto_id: string | null;
}

/** Reporte del mes en curso (y el siguiente, por si la prueba corre a fin de mes). */
async function createReport(tx: Tx, t: Tenant, centroId: string | null): Promise<string> {
  const id = testId();
  await tx`
    insert into cumplimiento.reporte (id, tenant_id, tipo, rango, hash_contenido, solicitante, centro_id)
    values (${id}, ${t.tenantId}, 'inspeccion',
            daterange(date_trunc('month', now())::date, (date_trunc('month', now()) + interval '2 months')::date),
            ${"a".repeat(64)}, ${t.dueno.usuario_id}, ${centroId})`;
  return id;
}

const verify = (tx: Tx, reporteId: string) =>
  tx<
    Fila[]
  >`select trabajador_id, integra, n_eventos, evento_roto_id from cumplimiento.verificar_reporte(${reporteId})`;

describe("verificación de un reporte", () => {
  it("el inspector verifica el reporte de su acceso y su consulta queda en la bitácora", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const otro = await createTenant(tx, "Dos");
      await insertEvent(tx, t, t.trabajadorA);
      await insertEvent(tx, t, t.trabajadorA, "salida");
      const alterado = await insertEvent(tx, t, t.trabajadorB);
      await insertEvent(tx, t, t.trabajadorB, "salida");

      const reporteId = await createReport(tx, t, null);
      const reporteAjeno = await createReport(tx, otro, null);
      await tx`insert into cumplimiento.acceso_inspector (tenant_id, reporte_id, usuario_id, creado_por)
               values (${t.tenantId}, ${reporteId}, ${t.inspector.usuario_id}, ${t.dueno.usuario_id})`;

      await asUser(tx, t.inspector, async () => {
        const filas = await verify(tx, reporteId);
        expect(filas).toHaveLength(3);
        expect(filas.every((f) => f.integra)).toBe(true);
        expect(filas.find((f) => f.trabajador_id === t.trabajadorA)?.n_eventos).toBe("2");
        expect(filas.find((f) => f.trabajador_id === t.trabajadorA2)?.n_eventos).toBe("0");

        expect(await expectPgError(tx, (sp) => verify(sp, reporteAjeno))).toMatch(
          /no tienes acceso/,
        );
        // Sigue sin poder leer los eventos directamente.
        expect(await tx`select 1 from jornada.evento`).toHaveLength(0);
      });

      // Alguien altera un evento por fuera: la verificación del inspector lo detecta.
      await tx`set local session_replication_role = replica`;
      await tx`update jornada.evento set tipo = 'salida' where id = ${alterado}`;
      await tx`set local session_replication_role = origin`;

      await asUser(tx, t.inspector, async () => {
        const filas = await verify(tx, reporteId);
        expect(filas.find((f) => f.trabajador_id === t.trabajadorB)).toMatchObject({
          integra: false,
          evento_roto_id: alterado,
        });
        expect(filas.find((f) => f.trabajador_id === t.trabajadorA)?.integra).toBe(true);
      });

      const accesos = await tx<{ usuario_id: string; entidad_id: string }[]>`
        select usuario_id, entidad_id from auditoria.bitacora_admin
        where tenant_id = ${t.tenantId} and accion = 'acceso_inspector'`;
      expect(accesos).toEqual([
        { usuario_id: t.inspector.usuario_id, entidad_id: reporteId },
        { usuario_id: t.inspector.usuario_id, entidad_id: reporteId },
      ]);

      // Con el acceso revocado ya no puede verificar.
      await tx`update cumplimiento.acceso_inspector set revocado_en = now() where reporte_id = ${reporteId}`;
      await asUser(tx, t.inspector, async () => {
        expect(await expectPgError(tx, (sp) => verify(sp, reporteId))).toMatch(/no tienes acceso/);
      });
    });
  });

  it("un reporte de un centro solo verifica a los trabajadores de ese centro", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const otro = await createTenant(tx, "Dos");
      await insertEvent(tx, t, t.trabajadorA);
      await insertEvent(tx, t, t.trabajadorB);
      const reporteCentroA = await createReport(tx, t, t.centroA);
      const reporteGeneral = await createReport(tx, t, null);

      await asUser(tx, t.supervisorA, async () => {
        const filas = await verify(tx, reporteCentroA);
        expect(new Set(filas.map((f) => f.trabajador_id))).toEqual(
          new Set([t.trabajadorA, t.trabajadorA2]),
        );
        expect(await expectPgError(tx, (sp) => verify(sp, reporteGeneral))).toMatch(
          /no tienes acceso/,
        );
      });
      await asUser(tx, t.dueno, async () => {
        expect(await verify(tx, reporteGeneral)).toHaveLength(3);
      });
      for (const ajeno of [otro.dueno, t.empleadoA, t.kioscoA]) {
        await asUser(tx, ajeno, async () => {
          expect(await expectPgError(tx, (sp) => verify(sp, reporteGeneral))).toMatch(
            /no tienes acceso/,
          );
        });
      }
    });
  });
});
