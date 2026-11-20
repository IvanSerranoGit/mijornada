// Avisos por correo: qué toca enviar cada día, a quién, y que no se repitan.
import { beforeAll, describe, expect, it } from "vitest";
import {
  CORREOS,
  enviarAvisosPendientes,
  ensureDocumentos,
  plantillaCorreo,
  type Mensaje,
} from "../src/index.ts";
import { admin, createEmpresa, createMember, type Actor, type Empresa } from "./helpers.ts";

let empresa: Empresa;
let empleado: Actor;
const ORIGEN = "https://mijornada.test";

/** Envío de prueba: junta los mensajes de esta empresa (la base local tiene otras). */
function buzon() {
  const mensajes: Mensaje[] = [];
  const propios = () =>
    mensajes.filter((m) => [empresa.dueno.email, empleado.email].includes(m.para));
  return { enviar: (m: Mensaje) => (mensajes.push(m), Promise.resolve(true)), propios };
}

const atrasar = (tabla: "trabajador" | "empresa", cambios: Record<string, string>, id: string) =>
  admin
    .schema("tenants")
    .from(tabla)
    .update(cambios as never)
    .eq("id", id);
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

beforeAll(async () => {
  empresa = await createEmpresa();
  empleado = await createMember(empresa, "empleado");
  await ensureDocumentos(await empresa.dueno.ctx());
}, 60_000);

describe("plantilla", () => {
  it("escapa el contenido y ofrece el enlace también en texto plano", () => {
    const { html, texto } = plantillaCorreo({
      titulo: "Hola <b>",
      parrafos: ["Uno & dos"],
      boton: { texto: "Entrar", url: "https://mijornada.test/a?b=1&c=2" },
    });
    expect(html).toContain("Hola &lt;b&gt;");
    expect(html).toContain("Uno &amp; dos");
    expect(html).toContain('href="https://mijornada.test/a?b=1&amp;c=2"');
    expect(texto).toContain("Entrar: https://mijornada.test/a?b=1&c=2");
    expect(
      CORREOS.pagoFallido(
        "a@b.mx",
        { empresa: "X", dia: 6, gracia_hasta: "2027-01-10T12:00:00Z" },
        ORIGEN,
      ).asunto,
    ).toMatch(/^Último aviso/);
  });
});

describe("avisos del cron diario", () => {
  it("recuerda el consentimiento a los 3 y a los 7 días, al trabajador y al dueño, una sola vez", async () => {
    // Recién dada de alta: todavía no toca.
    let b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios()).toEqual([]);

    const { data: documentos } = await admin
      .schema("cumplimiento")
      .from("documento")
      .select("id")
      .eq("tenant_id", empresa.tenantId);
    const envejecer = async (dias: number) => {
      await atrasar("trabajador", { creado_en: hace(dias) }, empresa.trabajadorId);
      await admin
        .schema("cumplimiento")
        .from("documento")
        .update({ creado_en: hace(dias) } as never)
        .in(
          "id",
          (documentos ?? []).map((d) => d.id),
        );
    };

    await envejecer(3.1);
    b = buzon();
    expect((await enviarAvisosPendientes(admin, b.enviar, ORIGEN)).fallidos).toBe(0);
    expect(
      b
        .propios()
        .map((m) => [m.para, m.asunto])
        .sort(),
    ).toEqual(
      [
        [empleado.email, "Tienes documentos por aceptar en Mi Jornada"],
        [empresa.dueno.email, "Consentimientos pendientes en tu equipo"],
      ].sort(),
    );
    expect(b.propios().find((m) => m.para === empresa.dueno.email)?.texto).toContain(
      "Mariana López todavía no acepta",
    );

    // La siguiente corrida no repite.
    b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios()).toEqual([]);

    // Al día 7 se recuerda otra vez, y después ya no.
    await envejecer(7.1);
    b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios()).toHaveLength(2);
    b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios()).toEqual([]);
  });

  it("si el envío falla, el aviso queda pendiente para la siguiente corrida", async () => {
    await atrasar(
      "empresa",
      { prueba_hasta: new Date(Date.now() + 3.5 * 86_400_000).toISOString() },
      empresa.tenantId,
    );
    const fallo = await enviarAvisosPendientes(admin, () => Promise.resolve(false), ORIGEN);
    expect(fallo.fallidos).toBeGreaterThanOrEqual(1);

    const b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios().map((m) => m.asunto)).toEqual(["Tu prueba de Mi Jornada termina en 4 días"]);
  });

  it("avisa la prueba por vencer el día 13 y el pago fallido los días 3 y 6", async () => {
    await atrasar(
      "empresa",
      { prueba_hasta: new Date(Date.now() + 0.5 * 86_400_000).toISOString() },
      empresa.tenantId,
    );
    let b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios().map((m) => m.asunto)).toEqual(["Tu prueba de Mi Jornada termina mañana"]);

    await atrasar("empresa", { plan: "basico", pago_fallido_en: hace(3.2) }, empresa.tenantId);
    b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios().map((m) => m.asunto)).toEqual(["No pudimos cobrar tu plan de Mi Jornada"]);

    await atrasar("empresa", { pago_fallido_en: hace(6.2) }, empresa.tenantId);
    b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(b.propios().map((m) => m.asunto)).toEqual([
      "Último aviso: no pudimos cobrar tu plan de Mi Jornada",
    ]);
    await atrasar("empresa", { plan: "prueba", pago_fallido_en: null as never }, empresa.tenantId);
  });

  it("avisa al dueño de una incidencia por resolver y al trabajador de una por responder", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
      new Date(),
    );
    await empleado.api("POST", "/incidencias", {
      trabajador_id: empresa.trabajadorId,
      fecha: hoy,
      tipo: "permiso",
      motivo: "Cita médica",
    });
    await empresa.dueno.api("POST", "/incidencias", {
      trabajador_id: empresa.trabajadorId,
      fecha: hoy,
      tipo: "falta_justificada",
      motivo: "Aviso previo",
    });

    const b = buzon();
    await enviarAvisosPendientes(admin, b.enviar, ORIGEN);
    expect(
      b
        .propios()
        .map((m) => [m.para, m.asunto])
        .sort(),
    ).toEqual(
      [
        [empresa.dueno.email, "Tienes 2 incidencias por resolver"],
        [empleado.email, expect.stringMatching(/registró una corrección en tu jornada$/)],
      ].sort(),
    );
  });
});
