import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  consentEvidenceHash,
  documentHash,
  markdownToHtml,
  parseLegalTemplate,
  pendingVariables,
  renderTemplate,
  sameName,
} from "../src/index.ts";

const legal = (name: string) =>
  readFileSync(new URL(`../../../docs/legal/${name}`, import.meta.url), "utf8");

describe("plantillas", () => {
  it("sustituye variables y resuelve bloques verdaderos, falsos e invertidos", () => {
    const texto =
      "{{a}}{{#foto}} con foto{{/foto}}{{^foto}} sin foto{{/foto}}{{#gps}} y {{b}}{{/gps}}.";
    expect(renderTemplate(texto, { a: "Marca", foto: true, gps: true, b: "ubicación" })).toBe(
      "Marca con foto y ubicación.",
    );
    expect(renderTemplate(texto, { a: "Marca", foto: false, gps: false, b: "x" })).toBe(
      "Marca sin foto.",
    );
    expect(renderTemplate("{{ a }}-{{b}}", { a: null, b: 0 })).toBe("-0");
  });

  it("deja intacto lo que no conoce, para renderizar en dos pasos", () => {
    const texto =
      "**{{razon_social}}** y {{nombre_trabajador}}{{#captura_foto}}, con foto{{/captura_foto}}";
    const empresa = renderTemplate(texto, { razon_social: "Tortillería La Güera" });
    expect(empresa).toBe(
      "**Tortillería La Güera** y {{nombre_trabajador}}{{#captura_foto}}, con foto{{/captura_foto}}",
    );
    expect(pendingVariables(empresa)).toEqual(["captura_foto", "nombre_trabajador"]);
    expect(renderTemplate(empresa, { nombre_trabajador: "Ana", captura_foto: true })).toBe(
      "**Tortillería La Güera** y Ana, con foto",
    );
  });

  it("lee los tres documentos de docs/legal sin encabezado ni nota interna", () => {
    const convenio = parseLegalTemplate(legal("convenio-registro-jornada-v0.9.md"));
    const aviso = parseLegalTemplate(legal("aviso-privacidad-integral-v0.9.md"));
    const resumen = parseLegalTemplate(legal("aviso-privacidad-simplificado-v0.9.md"));
    expect([convenio.tipo, aviso.tipo, resumen.tipo]).toEqual([
      "convenio_registro",
      "aviso_privacidad",
      "aviso_privacidad_simplificado",
    ]);
    for (const plantilla of [convenio, aviso, resumen]) {
      expect(plantilla.version).toBe("0.9");
      expect(plantilla.contenido).not.toMatch(/Nota de uso interno|^tipo:/m);
    }
    expect(convenio.contenido.startsWith("# Convenio para el registro electrónico")).toBe(true);

    // Con todas sus variables no queda nada por resolver.
    const vars = Object.fromEntries(
      [convenio, aviso, resumen].flatMap((p) => pendingVariables(p.contenido)).map((k) => [k, "x"]),
    );
    for (const plantilla of [convenio, aviso, resumen]) {
      expect(pendingVariables(renderTemplate(plantilla.contenido, vars))).toEqual([]);
    }
  });
});

describe("hash de documento", () => {
  it("es estable para el mismo texto y cambia con cualquier diferencia", async () => {
    const plantilla = parseLegalTemplate(legal("aviso-privacidad-integral-v0.9.md")).contenido;
    const vars = { razon_social: "Tortillería La Güera", rfc_patron: "TGU200101AB1" };
    const a = await documentHash(renderTemplate(plantilla, vars), "Resumen");
    const b = await documentHash(renderTemplate(plantilla, { ...vars }), "Resumen");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);

    const otros = await Promise.all([
      documentHash(
        renderTemplate(plantilla, { ...vars, razon_social: "Tortillería La Guera" }),
        "Resumen",
      ),
      documentHash(renderTemplate(plantilla, vars), "Resumen."),
      documentHash(renderTemplate(plantilla, vars)),
    ]);
    expect(new Set([a, ...otros]).size).toBe(4);
    // El resumen no se puede confundir con el final del texto.
    expect(await documentHash("ab", "c")).not.toBe(await documentHash("a", "bc"));
    await expect(documentHash("a\fb")).rejects.toThrow(/saltos de página/);
  });
});

describe("consentimiento", () => {
  it("el nombre tecleado coincide salvo acentos, mayúsculas y espacios", () => {
    expect(sameName("  maria  jose NUÑEZ lopez ", "María José Núñez López")).toBe(true);
    expect(sameName("Maria Lopez", "María José López")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });

  it("la evidencia depende de cada dato de la aceptación", async () => {
    const base = {
      documentoHash: "a".repeat(64),
      trabajadorId: "0193d5a0-0000-7000-8000-000000000001",
      nombreTecleado: "María López",
      aceptadoEn: "2027-01-04T15:00:00.000000Z",
      ip: "187.190.1.2",
    };
    const hash = await consentEvidenceHash(base);
    expect(hash).toBe(await consentEvidenceHash({ ...base }));
    const variantes = await Promise.all([
      consentEvidenceHash({ ...base, documentoHash: "b".repeat(64) }),
      consentEvidenceHash({ ...base, trabajadorId: "0193d5a0-0000-7000-8000-000000000002" }),
      consentEvidenceHash({ ...base, nombreTecleado: "Maria Lopez" }),
      consentEvidenceHash({ ...base, aceptadoEn: "2027-01-04T15:00:00.000001Z" }),
      consentEvidenceHash({ ...base, ip: "" }),
    ]);
    expect(new Set([hash, ...variantes]).size).toBe(6);
  });
});

describe("markdown", () => {
  it("convierte títulos, listas, negritas y párrafos, y escapa el HTML", () => {
    const html = markdownToHtml(
      "# Título\n\nUn **párrafo**\nen dos líneas con <script>alert(1)</script>.\n\n- uno\n- *dos*\n\n1. a\n2. b\n\n---\nVer https://mijornada.xyz/aviso.",
    );
    expect(html).toBe(
      [
        "<h1>Título</h1>",
        "<p>Un <strong>párrafo</strong> en dos líneas con &lt;script&gt;alert(1)&lt;/script&gt;.</p>",
        "<ul>",
        "<li>uno</li>",
        "<li><em>dos</em></li>",
        "</ul>",
        "<ol>",
        "<li>a</li>",
        "<li>b</li>",
        "</ol>",
        "<hr>",
        '<p>Ver <a href="https://mijornada.xyz/aviso">https://mijornada.xyz/aviso</a>.</p>',
      ].join("\n"),
    );
  });
});
