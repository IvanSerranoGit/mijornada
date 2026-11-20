// Documentos legales y consentimiento por la API, con sesiones reales y RLS.
import { documentHash, pendingVariables } from "@mijornada/dominio";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureDocumentos,
  getAvisoPublico,
  getDocumentoImprimible,
  handleKioscoRequest,
  registerFirmaAutografa,
  type DocumentoParaAceptar,
  type EstadoConsentimiento,
} from "../src/index.ts";
import {
  admin,
  createEmpresa,
  createMember,
  publico,
  type Actor,
  type Empresa,
} from "./helpers.ts";

let empresa: Empresa;
let empleado: Actor;

interface Documento {
  id: string;
  tipo: string;
  version: number;
  contenido_hash: string;
  contenido_md: string;
  resumen_md: string | null;
  plantilla_version: string | null;
}

beforeAll(async () => {
  empresa = await createEmpresa();
  empleado = await createMember(empresa, "empleado");
}, 60_000);

const vigente = (documentos: Documento[], tipo: string) => {
  const documento = documentos.find((d) => d.tipo === tipo);
  if (documento === undefined) throw new Error(`falta ${tipo}`);
  return documento;
};

describe("documentos de la empresa", () => {
  it("se crean una sola vez desde las plantillas, con los datos de la empresa y su hash", async () => {
    const ctx = await empresa.dueno.ctx();
    await ensureDocumentos(ctx);
    await ensureDocumentos(ctx);
    const { body } = await empresa.dueno.api<Documento[]>("GET", "/documentos");
    expect(body.map((d) => [d.tipo, d.version, d.plantilla_version])).toEqual([
      ["aviso_privacidad", 1, "0.9"],
      ["convenio_registro", 1, "0.9"],
    ]);

    for (const documento of body) {
      expect(documento.contenido_md).toMatch(/\*\*Tortillería [a-z0-9]+\*\*/);
      expect(documento.contenido_hash).toBe(
        await documentHash(documento.contenido_md, documento.resumen_md),
      );
      // Solo queda por resolver lo que depende de la persona y de su centro.
      expect(pendingVariables(documento.contenido_md)).not.toContain("razon_social");
    }
    expect(vigente(body, "aviso_privacidad").resumen_md).toMatch(/usará tu nombre/);
    // Sin RFC ni domicilio quedan líneas para llenar a mano.
    expect(vigente(body, "convenio_registro").contenido_md).toMatch(
      /con RFC _{8,} y domicilio en _{8,}/,
    );
  });

  it("el trabajador lee sus documentos con su nombre y su centro, y acepta con firma simple", async () => {
    const mios = await empleado.api<{ nombre: string; documentos: DocumentoParaAceptar[] }>(
      "GET",
      "/documentos/mios",
    );
    expect(mios.status).toBe(200);
    expect(mios.body.nombre).toBe("Mariana López");
    const convenio = mios.body.documentos.find((d) => d.tipo === "convenio_registro");
    const aviso = mios.body.documentos.find((d) => d.tipo === "aviso_privacidad");
    if (convenio === undefined || aviso === undefined) throw new Error("faltan documentos");
    expect(convenio.aceptado).toBe(false);
    expect(convenio.contenido_html).toContain("<strong>Mariana López</strong>");
    expect(convenio.contenido_html).toContain(
      "presta sus servicios como Cajera en el centro de trabajo Matriz",
    );
    expect(convenio.contenido_html).not.toMatch(/\{\{/);
    expect(aviso.resumen_html).toContain(`/aviso/${empresa.centroId}`);
    expect(aviso.resumen_html).not.toMatch(/\{\{/);

    const mal = await empleado.api<{ mensaje: string }>(
      "POST",
      `/documentos/${convenio.id}/aceptacion`,
      {
        nombre: "Mariana",
      },
    );
    expect(mal.status).toBe(422);
    expect(mal.body.mensaje).toMatch(/no coincide/);

    const bien = await empleado.api<{ evidencia_hash: string }>(
      "POST",
      `/documentos/${convenio.id}/aceptacion`,
      { nombre: "mariana lopez" },
    );
    expect(bien.status).toBe(201);
    expect(bien.body.evidencia_hash).toMatch(/^[0-9a-f]{64}$/);

    // El dueño no puede aceptar por ella.
    const ajeno = await empresa.dueno.api("POST", `/documentos/${aviso.id}/aceptacion`, {
      nombre: "Mariana López",
    });
    expect(ajeno.status).toBe(403);

    const estado = await empresa.dueno.api<EstadoConsentimiento[]>("GET", "/consentimientos");
    expect(
      estado.body
        .filter((e) => e.trabajador_id === empresa.trabajadorId)
        .map((e) => [e.tipo, e.aceptado, e.metodos])
        .sort(),
    ).toEqual([
      ["aviso_privacidad", false, []],
      ["convenio_registro", true, ["firma_simple"]],
    ]);
  });

  it("el kiosco muestra el aviso pendiente y lo registra con clic", async () => {
    const ctx = await empresa.dueno.ctx();
    const { data: codigo } = await ctx.db
      .schema("tenants")
      .rpc("generar_codigo_enlace", { centro_id: empresa.centroId });
    const kiosco = async <T>(ruta: string, body: unknown, token?: string) => {
      const request = new Request(`http://kiosco.test/api/v1/kiosco${ruta}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.1.2.3, 172.16.0.1",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const response = await handleKioscoRequest(request, ruta.split("/").filter(Boolean), {
        publico,
        admin: () => admin,
        origin: "https://mijornada.test",
      });
      return { status: response.status, body: (await response.json()) as T };
    };
    const vinculo = await kiosco<{ token: string }>("/vincular", { codigo });
    const token = vinculo.body.token;

    const aviso = await kiosco<{
      pendiente: boolean;
      documento_id: string;
      resumen_html: string;
      nombre: string;
    }>("/aviso", { pin: empresa.pin }, token);
    expect(aviso.body).toMatchObject({ pendiente: true, nombre: "Mariana López" });
    expect(aviso.body.resumen_html).toContain(`https://mijornada.test/aviso/${empresa.centroId}`);

    const aceptado = await kiosco(
      "/aviso/aceptar",
      { pin: empresa.pin, documento_id: aviso.body.documento_id },
      token,
    );
    expect(aceptado.status).toBe(201);
    expect(
      (await kiosco<{ pendiente: boolean }>("/aviso", { pin: empresa.pin }, token)).body,
    ).toEqual({
      pendiente: false,
    });

    const { data: fila } = await admin
      .schema("cumplimiento")
      .from("consentimiento")
      .select("metodo, ip")
      .eq("trabajador_id", empresa.trabajadorId)
      .eq("documento_id", aviso.body.documento_id)
      .single();
    expect(fila).toEqual({ metodo: "clic", ip: "10.1.2.3" });
  });

  it("el patrón sube la firma autógrafa; el aviso público y el ejemplar para imprimir no llevan variables", async () => {
    const ctx = await empresa.dueno.ctx();
    const documentos = (await empresa.dueno.api<Documento[]>("GET", "/documentos")).body;
    const convenio = vigente(documentos, "convenio_registro");

    const pdf = new TextEncoder().encode("%PDF-1.4 ejemplar firmado");
    const firma = await registerFirmaAutografa(ctx, {
      trabajador_id: empresa.trabajadorId,
      documento_id: convenio.id,
      archivo: pdf,
      tipo_mime: "application/pdf",
    });
    expect(firma.archivo_hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      registerFirmaAutografa(ctx, {
        trabajador_id: empresa.trabajadorId,
        documento_id: convenio.id,
        archivo: pdf,
        tipo_mime: "text/plain",
      }),
    ).rejects.toMatchObject({ status: 422 });

    const aviso = await getAvisoPublico(publico, empresa.centroId, "https://mijornada.test");
    expect(aviso?.contenido_html).toContain("Aviso de privacidad integral");
    expect(aviso?.contenido_html).not.toMatch(/\{\{/);
    expect(await getAvisoPublico(publico, empresa.tenantId, "https://mijornada.test")).toBeNull();

    const enBlanco = await getDocumentoImprimible(ctx, convenio.id, "https://mijornada.test");
    const personal = await getDocumentoImprimible(
      ctx,
      convenio.id,
      "https://mijornada.test",
      empresa.trabajadorId,
    );
    expect(enBlanco.contenido_html).not.toMatch(/\{\{|Mariana/);
    expect(personal.contenido_html).toContain("Mariana López");
    expect(personal.contenido_html).toContain(convenio.contenido_hash);
  });

  it("una versión nueva (texto del abogado) deja pendientes los consentimientos; solo publica un administrador", async () => {
    const texto = `# Convenio revisado\n\n**{{razon_social}}** y **{{nombre_trabajador}}** acuerdan el registro electrónico de la jornada. ${"Cláusula. ".repeat(30)}`;
    expect(
      (
        await empleado.api("POST", "/documentos", {
          tipo: "convenio_registro",
          contenido_md: texto,
        })
      ).status,
    ).toBe(403);
    const rara = await empresa.dueno.api<{ mensaje: string }>("POST", "/documentos", {
      tipo: "convenio_registro",
      contenido_md: `${texto} {{salario}}`,
    });
    expect(rara.status).toBe(422);
    expect(rara.body.mensaje).toMatch(/salario/);

    const nueva = await empresa.dueno.api<Documento>("POST", "/documentos", {
      tipo: "convenio_registro",
      contenido_md: texto,
    });
    expect(nueva.status).toBe(201);
    expect(nueva.body).toMatchObject({ version: 2, plantilla_version: null });

    const estado = await empresa.dueno.api<EstadoConsentimiento[]>("GET", "/consentimientos");
    expect(
      estado.body.find(
        (e) => e.trabajador_id === empresa.trabajadorId && e.tipo === "convenio_registro",
      ),
    ).toMatchObject({ version: 2, aceptado: false, metodos: [] });
  });
});
