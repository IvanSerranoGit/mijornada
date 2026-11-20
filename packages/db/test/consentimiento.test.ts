// Documentos legales versionados y consentimiento de los trabajadores.
import { consentEvidenceHash } from "@mijornada/dominio";
import { afterAll, describe, expect, it } from "vitest";
import { readLegalTemplates } from "../src/seed-legal.ts";
import {
  asRole,
  asUser,
  createTenant,
  expectPgError,
  inRollback,
  sql,
  type Tenant,
  type Tx,
} from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

const TS = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** El dueño publica una versión de un documento. */
async function publish(tx: Tx, t: Tenant, tipo: string, version: number): Promise<string> {
  return asUser(tx, t.dueno, async () => {
    const [row] = await tx<{ id: string }[]>`
      insert into cumplimiento.documento (tenant_id, tipo, version, contenido_hash, contenido_md, resumen_md, vigente_desde, creado_por)
      values (${t.tenantId}, ${tipo}, ${version}, ${String(version).repeat(64).slice(0, 64)}, ${`Texto v${String(version)}`},
              ${tipo === "aviso_privacidad" ? "Resumen" : null}, current_date, ${t.dueno.usuario_id})
      returning id`;
    return row?.id ?? "";
  });
}

interface Estado {
  trabajador_id: string;
  tipo: string;
  version: number;
  aceptado: boolean;
  metodos: string[];
}

const estado = (tx: Tx, t: Tenant, trabajadorId: string) =>
  asUser(
    tx,
    t.dueno,
    () => tx<Estado[]>`
      select trabajador_id, tipo, version, aceptado, metodos
      from cumplimiento.estado_consentimientos(${t.tenantId})
      where trabajador_id = ${trabajadorId} order by tipo`,
  );

describe("plantillas legales", () => {
  it("el seed coincide con los archivos de docs/legal", async () => {
    const enBase = await sql`
      select tipo, version, contenido_md, resumen_md from cumplimiento.plantilla order by tipo desc`;
    expect(enBase.map((p) => ({ ...p }))).toEqual(await readLegalTemplates());
  });
});

describe("firma simple en la PWA", () => {
  it("exige el nombre registrado, fija la hora y la evidencia, y es idempotente", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`update tenants.trabajador set nombre = 'María José Núñez' where id = ${t.trabajadorA}`;
      const convenio = await publish(tx, t, "convenio_registro", 1);

      const accept = (nombre: string) => (sp: Tx) => sp<
        { consentimiento_id: string; evidencia_hash: string; aceptado: string }[]
      >`
        select consentimiento_id, evidencia_hash, to_char(aceptado_en at time zone 'UTC', ${sql.unsafe(TS)}) as aceptado
        from cumplimiento.aceptar_documento(${convenio}, ${nombre}, '187.190.1.2', 'Safari de prueba')`;

      await asUser(tx, t.empleadoA, async () => {
        expect(await expectPgError(tx, accept("María Núñez"))).toMatch(/no coincide/);
        expect(await expectPgError(tx, accept("   "))).toMatch(/no coincide/);

        const [primera] = await accept("  maria jose NUÑEZ ")(tx);
        if (primera === undefined) throw new Error("no se registró");
        expect(primera.evidencia_hash).toBe(
          await consentEvidenceHash({
            documentoHash: "1".repeat(64),
            trabajadorId: t.trabajadorA,
            nombreTecleado: "maria jose NUÑEZ",
            aceptadoEn: primera.aceptado,
            ip: "187.190.1.2",
          }),
        );
        // Aceptar de nuevo devuelve la misma aceptación.
        const [segunda] = await accept("María José Núñez")(tx);
        expect(segunda).toEqual(primera);

        // No puede insertar una aceptación por su cuenta.
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
              insert into cumplimiento.consentimiento (tenant_id, trabajador_id, documento_id, metodo)
              values (${t.tenantId}, ${t.trabajadorA}, ${convenio}, 'clic')`,
          ),
        ).toMatch(/row-level security/);
      });

      // Otro rol no acepta por el trabajador.
      await asUser(tx, t.dueno, async () => {
        expect(await expectPgError(tx, accept("María José Núñez"))).toMatch(
          /Solo el propio trabajador/,
        );
      });

      const [fila] = await tx`
        select metodo, nombre_tecleado, host(ip) as ip, user_agent, registrado_por
        from cumplimiento.consentimiento where trabajador_id = ${t.trabajadorA}`;
      expect(fila).toEqual({
        metodo: "firma_simple",
        nombre_tecleado: "maria jose NUÑEZ",
        ip: "187.190.1.2",
        user_agent: "Safari de prueba",
        registrado_por: t.empleadoA.usuario_id,
      });
    });
  });

  it("una versión nueva deja pendiente el consentimiento y la anterior ya no se puede aceptar", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const v1 = await publish(tx, t, "convenio_registro", 1);
      await asUser(tx, t.empleadoA, async () => {
        await tx`select * from cumplimiento.aceptar_documento(${v1}, 'Ana')`;
      });
      expect(await estado(tx, t, t.trabajadorA)).toMatchObject([
        { tipo: "convenio_registro", version: 1, aceptado: true, metodos: ["firma_simple"] },
      ]);

      const v2 = await publish(tx, t, "convenio_registro", 2);
      expect(await estado(tx, t, t.trabajadorA)).toMatchObject([
        { tipo: "convenio_registro", version: 2, aceptado: false, metodos: [] },
      ]);
      // Otro trabajador no puede aceptar ya la versión 1.
      const beto = { ...t.empleadoA, trabajador_id: t.trabajadorA2 };
      await asUser(tx, beto, async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`select * from cumplimiento.aceptar_documento(${v1}, 'Beto')`,
          ),
        ).toMatch(/ya no es la versión vigente/);
        await tx`select * from cumplimiento.aceptar_documento(${v2}, 'beto')`;
      });
      expect(await estado(tx, t, t.trabajadorA2)).toMatchObject([{ version: 2, aceptado: true }]);
    });
  });
});

describe("kiosco y firma autógrafa", () => {
  it("el kiosco registra con clic el aviso de privacidad; el convenio sigue pendiente", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const aviso = await publish(tx, t, "aviso_privacidad", 1);
      await publish(tx, t, "convenio_registro", 1);
      const [alta] = await asUser(
        tx,
        t.dueno,
        () => tx<{ id: string; pin: string }[]>`
          select id, pin from tenants.crear_trabajador(centro_id => ${t.centroA}, nombre => 'Dora Paz')`,
      );
      if (alta === undefined) throw new Error("no se creó");
      const codigo = await asUser(tx, t.dueno, async () => {
        const [row] = await tx<
          { codigo: string }[]
        >`select tenants.generar_codigo_enlace(${t.centroA}) as codigo`;
        return row?.codigo ?? "";
      });

      await asRole(tx, "anon", async () => {
        const [vinculo] = await tx<
          { token: string }[]
        >`select token from tenants.vincular_dispositivo(${codigo})`;
        const token = vinculo?.token ?? "";
        const pendiente = () => tx<
          { pendiente: boolean; nombre: string; resumen_md: string; documento_id: string }[]
        >`
          select pendiente, nombre, resumen_md, documento_id
          from cumplimiento.kiosco_aviso_pendiente(${token}, ${alta.pin})`;

        expect(await pendiente()).toEqual([
          { pendiente: true, nombre: "Dora Paz", resumen_md: "Resumen", documento_id: aviso },
        ]);
        expect(
          await expectPgError(
            tx,
            (sp) => sp`select * from cumplimiento.kiosco_aviso_pendiente(${token}, 'xxxx')`,
          ),
        ).toMatch(/No reconocemos/);

        await tx`select * from cumplimiento.kiosco_aceptar(${token}, ${aviso}, ${alta.pin}, null, '10.0.0.7', 'Tablet')`;
        expect((await pendiente())[0]?.pendiente).toBe(false);
      });

      expect(await estado(tx, t, alta.id)).toMatchObject([
        { tipo: "aviso_privacidad", aceptado: true, metodos: ["clic"] },
        { tipo: "convenio_registro", aceptado: false, metodos: [] },
      ]);
    });
  });

  it("el patrón sube la firma autógrafa y convive con la firma simple", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const convenio = await publish(tx, t, "convenio_registro", 1);
      await asUser(tx, t.empleadoA, async () => {
        await tx`select * from cumplimiento.aceptar_documento(${convenio}, 'Ana')`;
      });

      const upload = (who: Tenant["dueno"]) => (sp: Tx) => sp`
        insert into cumplimiento.consentimiento
          (tenant_id, trabajador_id, documento_id, metodo, archivo_url, archivo_hash, registrado_por)
        values (${t.tenantId}, ${t.trabajadorA}, ${convenio}, 'firma_autografa',
                ${`${t.tenantId}/firmas/x.pdf`}, ${"f".repeat(64)}, ${who.usuario_id})`;
      await asUser(tx, t.supervisorA, async () => {
        expect(await expectPgError(tx, upload(t.supervisorA))).toMatch(/row-level security/);
      });
      await asUser(tx, t.dueno, async () => {
        await upload(t.dueno)(tx);
      });

      const [fila] = await estado(tx, t, t.trabajadorA);
      expect(fila?.aceptado).toBe(true);
      expect([...(fila?.metodos ?? [])].sort()).toEqual(["firma_autografa", "firma_simple"]);
    });
  });
});
