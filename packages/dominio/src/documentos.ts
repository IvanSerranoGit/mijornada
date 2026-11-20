// Documentos legales (convenio de registro, aviso de privacidad): plantillas con
// variables, Markdown mínimo y los hashes que prueban qué texto se aceptó.
// Detalle en docs/documentos-y-consentimiento.md.
import { bytesToHex, sha256 } from "./hash.ts";

const encoder = new TextEncoder();

export type TemplateValue = string | number | boolean | null | undefined;
export type TemplateVars = Readonly<Record<string, TemplateValue>>;

const SECTION = /\{\{([#^])\s*([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;
const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Renderiza una plantilla con la parte de Mustache que usan los documentos legales:
 * `{{variable}}`, `{{#bloque}}…{{/bloque}}` (si es verdadero) y `{{^bloque}}…{{/bloque}}`
 * (si es falso). No escapa HTML: el resultado es Markdown.
 *
 * Una variable o bloque que no está en `vars` se deja tal cual. Así un documento se
 * renderiza en dos pasos: primero con los datos de la empresa (ese texto es la versión
 * que se guarda y se hashea) y después con los del trabajador y su centro.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  const has = (key: string) => Object.hasOwn(vars, key);
  const sections = template.replace(SECTION, (match, kind: string, key: string, body: string) => {
    if (!has(key)) return match;
    const truthy = Boolean(vars[key]);
    return (kind === "#") === truthy ? renderTemplate(body, vars) : "";
  });
  return sections.replace(VARIABLE, (match, key: string) => {
    if (!has(key)) return match;
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

/** Variables y bloques que siguen sin resolver en un texto. */
export function pendingVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{[#^/]?\s*([a-z_]+)\s*\}\}/g)) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return [...found].sort();
}

export interface LegalTemplate {
  tipo: string;
  version: string;
  /** Texto de la plantilla, sin el encabezado ni la nota de uso interno. */
  contenido: string;
}

/**
 * Lee un archivo de docs/legal: separa el encabezado (`tipo`, `version`) y quita la
 * "Nota de uso interno (no se imprime)" del final.
 */
export function parseLegalTemplate(source: string): LegalTemplate {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("La plantilla no tiene encabezado.");
  const [, header = "", body = ""] = match;
  const field = (name: string) => {
    const value = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(header)?.[1]?.trim();
    if (value === undefined) throw new Error(`A la plantilla le falta "${name}".`);
    return value;
  };
  const contenido = body.replace(/\n---\n+\*Nota de uso interno[\s\S]*$/, "").trim();
  return { tipo: field("tipo"), version: field("version"), contenido: `${contenido}\n` };
}

/**
 * Hash de una versión de documento: SHA-256 del texto ya renderizado para la empresa.
 * Si el documento tiene resumen (el aviso simplificado), entra después de un salto de
 * página (`\f`), que no puede aparecer dentro del texto.
 */
export async function documentHash(
  contenido: string,
  resumen: string | null = null,
): Promise<string> {
  if (contenido.includes("\f") || resumen?.includes("\f")) {
    throw new Error("El texto del documento no puede llevar saltos de página.");
  }
  const text = resumen === null ? contenido : `${contenido}\f${resumen}`;
  return bytesToHex(await sha256(encoder.encode(text)));
}

/** Nombre sin acentos, en minúsculas y con espacios simples: para comparar lo tecleado. */
export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** ¿El nombre tecleado es el registrado, salvo acentos, mayúsculas y espacios? */
export function sameName(typed: string, registered: string): boolean {
  const a = normalizeName(typed);
  return a !== "" && a === normalizeName(registered);
}

export interface ConsentEvidence {
  /** contenido_hash de la versión de documento aceptada. */
  documentoHash: string;
  trabajadorId: string;
  /** Tal como se tecleó (firma simple) o cadena vacía (clic). */
  nombreTecleado: string;
  /** Hora del servidor en UTC con microsegundos (`2027-01-04T15:00:00.000000Z`). */
  aceptadoEn: string;
  /** Dirección IP o cadena vacía si no se conoce. */
  ip: string;
}

/**
 * Evidencia de una aceptación:
 * SHA-256(documento_hash | trabajador_id | nombre_tecleado | aceptado_en | ip),
 * con los campos unidos por "|" en UTF-8, igual que el hash de los eventos.
 */
export async function consentEvidenceHash(evidence: ConsentEvidence): Promise<string> {
  const canonical = [
    evidence.documentoHash,
    evidence.trabajadorId,
    evidence.nombreTecleado,
    evidence.aceptadoEn,
    evidence.ip,
  ].join("|");
  return bytesToHex(await sha256(encoder.encode(canonical)));
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(https:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1">$1</a>');
}

/**
 * Markdown mínimo a HTML para mostrar e imprimir documentos legales: títulos, negritas,
 * cursivas, listas, líneas y párrafos. Todo el texto se escapa primero, así que un
 * documento subido por el patrón no puede inyectar HTML.
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let paragraph: string[] = [];
  const closeParagraph = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    const item = /^(-|\d+\.)\s+(.+)$/.exec(line);
    if (line === "") {
      closeParagraph();
      closeList();
    } else if (heading) {
      closeParagraph();
      closeList();
      const level = String(heading[1]?.length ?? 1);
      out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeParagraph();
      closeList();
      out.push("<hr>");
    } else if (item) {
      closeParagraph();
      const kind = item[1] === "-" ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(item[2] ?? "")}</li>`);
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  closeParagraph();
  closeList();
  return out.join("\n");
}
