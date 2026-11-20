import "server-only";
import type { Browser } from "playwright-core";

// PDF con Playwright (Chromium sin interfaz). En Vercel el navegador viene de
// @sparticuz/chromium, hecho para funciones serverless; en local y en CI se usa el
// Chromium que instala Playwright (`pnpm exec playwright install chromium`).
async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env["VERCEL"]) {
    const { default: sparticuz } = await import("@sparticuz/chromium");
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

export interface PaginaPdf {
  /** Título del documento (metadatos y encabezado). */
  titulo: string;
  /** Cuerpo en HTML ya saneado (sale de markdownToHtml o de plantillas propias). */
  cuerpoHtml: string;
  /** Línea al pie de cada página, junto al número de página. */
  pie: string;
  /** Logo de la empresa como data URL; si falta, el de Mi Jornada. */
  logo?: string;
  /** CSS adicional para ese documento. */
  estilos?: string;
}

const escapar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LOGO_MI_JORNADA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0F766E"/><path d="M11 8v10a5 5 0 0 0 10 0V8" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></svg>`;

/** Página HTML limpia y sobria, pensada para imprimirse en carta. */
export function paginaHtml(pagina: PaginaPdf): string {
  const logo = pagina.logo
    ? `<img src="${escapar(pagina.logo)}" alt="" style="height:28px">`
    : LOGO_MI_JORNADA;
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<title>${escapar(pagina.titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #111827; margin: 0; }
  header.marca { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; margin-bottom: 18px; border-bottom: 1px solid #d1d5db; }
  header.marca span { font-size: 9pt; color: #4b5563; }
  h1 { font-size: 15pt; line-height: 1.25; margin: 0 0 14px; }
  h2 { font-size: 11.5pt; margin: 18px 0 6px; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 14px 0 4px; break-after: avoid; }
  p { margin: 0 0 8px; text-align: justify; }
  ul, ol { margin: 0 0 8px; padding-left: 20px; }
  li { margin-bottom: 3px; }
  hr { border: 0; border-top: 1px solid #d1d5db; margin: 16px 0; }
  a { color: inherit; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 8.5pt; }
  th, td { border: 1px solid #d1d5db; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  tr { break-inside: avoid; }
  .firmas { display: flex; gap: 40px; margin-top: 56px; break-inside: avoid; }
  .firmas div { flex: 1; border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-size: 9pt; }
  .nota { font-size: 8.5pt; color: #4b5563; }
  .mono { font-family: "Courier New", monospace; font-size: 8pt; word-break: break-all; }
  .salto { break-before: page; }
  ${pagina.estilos ?? ""}
</style>
</head>
<body>
<header class="marca">${logo}<span>${escapar(pagina.titulo)}</span></header>
${pagina.cuerpoHtml}
</body>
</html>`;
}

/** Renderiza la página a PDF tamaño carta, con pie y número de página. */
export async function htmlToPdf(pagina: PaginaPdf): Promise<Uint8Array<ArrayBuffer>> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(paginaHtml(pagina), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "18mm", bottom: "20mm", left: "18mm", right: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;padding:0 18mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#6b7280;display:flex;justify-content:space-between"><span>${escapar(pagina.pie)}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
