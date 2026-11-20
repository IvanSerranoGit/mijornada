// Reporte para inspección, acceso de inspector y verificación pública.
import { bytesToHex, sha256, uuidV7 } from "@mijornada/dominio";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createAccesoInspector,
  downloadReporte,
  ensureDocumentos,
  getVerificacionPublica,
  loginInspector,
  openReporteInspector,
  sesionFromClaims,
  type Ctx,
} from "../src/index.ts";
import {
  admin,
  createEmpresa,
  createMember,
  newClient,
  publico,
  servicios,
  type Actor,
  type Empresa,
} from "./helpers.ts";

let empresa: Empresa;
let empleado: Actor;
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
  new Date(),
);

interface Reporte {
  id: string;
  hash_contenido: string;
  hash_raiz: string;
  n_eventos: number;
  url_verificacion: string;
}
let reporte: Reporte;

beforeAll(async () => {
  empresa = await createEmpresa();
  empleado = await createMember(empresa, "empleado");
  await ensureDocumentos(await empresa.dueno.ctx());
  for (const tipo of ["entrada", "salida"]) {
    const marcado = await empleado.api("POST", "/eventos", {
      trabajador_id: empresa.trabajadorId,
      client_event_id: uuidV7(),
      tipo,
      origen: "pwa",
      ts_dispositivo: new Date().toISOString(),
    });
    if (marcado.status !== 200 && marcado.status !== 201)
      throw new Error(JSON.stringify(marcado.body));
  }
}, 60_000);

describe("reporte para inspección", () => {
  it("solo lo genera un administrador y valida el alcance", async () => {
    const cuerpo = { tipo: "inspeccion", desde: hoy, hasta: hoy };
    expect((await empleado.api("POST", "/reportes", cuerpo)).status).toBe(403);
    expect(
      (
        await empresa.dueno.api("POST", "/reportes", {
          ...cuerpo,
          desde: "2027-01-02",
          hasta: "2027-01-01",
        })
      ).status,
    ).toBe(422);
    expect(
      (await empresa.dueno.api("POST", "/reportes", { ...cuerpo, tipo: "trabajador" })).status,
    ).toBe(422);
  });

  it("genera PDF y CSV con sus huellas, en el orden que pide la inspección", async () => {
    const creado = await empresa.dueno.api<Reporte>("POST", "/reportes", {
      tipo: "inspeccion",
      desde: hoy,
      hasta: hoy,
      centro_id: empresa.centroId,
    });
    expect(creado.status).toBe(201);
    reporte = creado.body;
    expect(reporte.n_eventos).toBe(2);
    expect(reporte.url_verificacion).toMatch(
      /^https:\/\/mijornada\.test\/verificar\/[0-9a-f]{48}$/,
    );

    const ctx = await empresa.dueno.ctx();
    const eventos = await downloadReporte(ctx, reporte.id, "eventos", null);
    expect(bytesToHex(await sha256(eventos.cuerpo))).toBe(reporte.hash_contenido);
    const csv = new TextDecoder().decode(eventos.cuerpo);
    const [encabezado, ...filas] = csv.trim().split("\r\n");
    expect(encabezado).toContain("id,tenant_id,trabajador_id,tipo,ts_servidor");
    expect(encabezado).toContain("hash_prev,hash,hash_version");
    expect(encabezado).not.toContain("foto_url");
    expect(filas).toHaveLength(2);

    const dias = new TextDecoder().decode(
      (await downloadReporte(ctx, reporte.id, "dias", null)).cuerpo,
    );
    expect(dias).toContain("minutos_trabajados");
    expect(dias.trim().split("\r\n")).toHaveLength(2);

    const pdf = new TextDecoder().decode(
      (await downloadReporte(ctx, reporte.id, "pdf", null)).cuerpo,
    );
    const orden = [
      "Reporte de registro de jornada para inspección",
      "Hash raíz del periodo",
      reporte.hash_raiz,
      reporte.url_verificacion,
      "Mariana López",
      "Registro diario",
      "Resumen semanal",
      "Estado de consentimientos",
      "Consentimiento pendiente",
      "Notas del periodo",
      "No hubo marcas con sincronización tardía",
      "Acta de integridad",
      "1 de 1 cadenas íntegras",
      "Sellos diarios del periodo",
    ].map((texto) => pdf.indexOf(texto));
    expect(orden.every((posicion) => posicion >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(pdf).toContain(`huella del CSV de eventos (SHA-256) ${reporte.hash_contenido}`);

    const lista = await empresa.dueno.api<{ id: string }[]>("GET", "/reportes");
    expect(lista.body.map((r) => r.id)).toContain(reporte.id);
  });

  it("la verificación pública dice íntegro y no expone datos personales", async () => {
    const token = reporte.url_verificacion.split("/").at(-1) ?? "";
    const verificacion = await getVerificacionPublica(publico, token);
    expect(verificacion).toMatchObject({
      tipo: "inspeccion",
      desde: hoy,
      hasta: hoy,
      integra: true,
      cadenas: 1,
      eventos: 2,
      eventos_al_generar: 2,
      hash_contenido: reporte.hash_contenido,
    });
    expect(JSON.stringify(verificacion)).not.toMatch(/Mariana|Tortillería/);
    expect(await getVerificacionPublica(publico, "0".repeat(48))).toBeNull();

    const interna = await empresa.dueno.api("GET", `/reportes/${reporte.id}/verificacion`);
    expect(interna.body).toEqual({ integra: true, cadenas: 1, eventos: 2, rotas: 0 });
  });
});

describe("acceso de inspector", () => {
  it("el enlace abre una sesión limitada a ese reporte, deja rastro y se puede revocar", async () => {
    const acceso = await empresa.dueno.api<{ id: string; enlace: string; expira_en: string }>(
      "POST",
      `/reportes/${reporte.id}/accesos`,
    );
    expect(acceso.status).toBe(201);
    const token = acceso.body.enlace.split("/").at(-1) ?? "";
    const horas = (new Date(acceso.body.expira_en).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(71.9);
    expect(horas).toBeLessThanOrEqual(72);

    // El servidor canjea el token por una sesión de un solo uso.
    expect(await loginInspector(admin, "0".repeat(48))).toBeNull();
    const concedido = await loginInspector(admin, token);
    if (concedido === null) throw new Error("no se concedió el acceso");
    const db = newClient();
    expect(
      (await db.auth.verifyOtp({ token_hash: concedido.tokenHash, type: "email" })).error,
    ).toBeNull();
    const claims = await db.auth.getClaims();
    const sesion = claims.data ? sesionFromClaims(claims.data.claims) : null;
    expect(sesion).toMatchObject({ rol: "inspector", tenantId: empresa.tenantId });
    if (sesion === null) throw new Error("sin sesión");
    const inspector: Ctx = { db, sesion };

    const abierto = await openReporteInspector(inspector, "189.203.1.9");
    expect(abierto.reporte.id).toBe(reporte.id);
    expect(abierto.verificacion).toMatchObject({ integra: true, eventos: 2 });
    const pdf = await downloadReporte(inspector, reporte.id, "pdf", "189.203.1.9");
    expect(new TextDecoder().decode(pdf.cuerpo.subarray(0, 4))).toBe("%PDF");

    // No ve nada más: ni eventos, ni trabajadores, ni otros reportes.
    expect((await db.schema("jornada").from("evento").select("id")).data).toEqual([]);
    expect((await db.schema("tenants").from("trabajador").select("id")).data).toEqual([]);
    const otro = await empresa.dueno.api<Reporte>("POST", "/reportes", {
      tipo: "periodo",
      desde: hoy,
      hasta: hoy,
    });
    await expect(downloadReporte(inspector, otro.body.id, "pdf", null)).rejects.toMatchObject({
      status: 404,
    });

    const consultas = await empresa.dueno.api<{ accion: string; ip: string | null }[]>(
      "GET",
      `/reportes/${reporte.id}/consultas`,
    );
    expect(consultas.body.map((consulta) => [consulta.accion, consulta.ip]).sort()).toEqual([
      ["acceso_inspector", null],
      ["inspector_abre_reporte", "189.203.1.9"],
      ["inspector_descarga_pdf", "189.203.1.9"],
    ]);

    // Revocado: la sesión abierta deja de servir y el enlace ya no abre otra.
    const revocado = await empresa.dueno.api(
      "POST",
      `/accesos-inspector/${acceso.body.id}/revocacion`,
    );
    expect(revocado.status).toBe(200);
    await expect(openReporteInspector(inspector, null)).rejects.toMatchObject({ status: 403 });
    await expect(downloadReporte(inspector, reporte.id, "pdf", null)).rejects.toMatchObject({
      status: 404,
    });
    expect(await loginInspector(admin, token)).toBeNull();

    // Solo un administrador comparte un reporte.
    await expect(
      createAccesoInspector(await empleado.ctx(), reporte.id, servicios, "https://x.test"),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
