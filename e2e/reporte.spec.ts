// Reporte para inspección: el dueño lo genera, lo comparte con un inspector por enlace
// temporal, el inspector lo verifica y descarga, y el dueño ve el rastro y lo revoca.
import { expect, test } from "@playwright/test";
import { activarAcceso, altaEmpresa, WEB } from "./alta.ts";
import { aceptarDocumentos } from "./consentimiento.ts";

test("generación de reporte, acceso de inspector y verificación pública", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const alta = await altaEmpresa(page, "Reportes");

  // La trabajadora acepta sus documentos y marca su entrada: ya hay un registro que reportar.
  const celular = await (await browser.newContext()).newPage();
  await activarAcceso(celular, alta);
  await aceptarDocumentos(celular, "Mariana López");
  await celular.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(celular.getByText(/Entrada registrada a las/)).toBeVisible();

  // El dueño genera el reporte de inspección del mes.
  await page.getByRole("link", { name: "Reportes" }).click();
  await page.getByRole("button", { name: "Generar reporte" }).click();
  await expect(page.getByText("Reporte generado. Lo encuentras abajo.")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/1 registros · generado el/)).toBeVisible();

  const pdf = await page.request.get(
    `${WEB}${(await page.getByRole("link", { name: "PDF", exact: true }).getAttribute("href")) ?? ""}`,
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const csv = await page.request.get(
    `${WEB}${(await page.getByRole("link", { name: "CSV de eventos" }).getAttribute("href")) ?? ""}`,
  );
  expect(await csv.text()).toContain("hash_prev,hash,hash_version");

  // Lo comparte: el enlace se muestra una sola vez.
  await page.getByRole("button", { name: "Crear enlace para inspector" }).click();
  const enlace = (await page.getByText(/\/inspector\/[0-9a-f]{48}/).textContent()) ?? "";
  expect(enlace).toMatch(/^http/);

  // El inspector lo abre en su navegador, sin cuenta: ve la verificación y descarga el PDF.
  const contexto = await browser.newContext();
  const inspector = await contexto.newPage();
  await inspector.goto(enlace);
  await expect(inspector.getByRole("heading", { name: "Reporte para inspección" })).toBeVisible();
  await expect(inspector.getByText("Registros íntegros")).toBeVisible();
  await expect(inspector.getByText(/1 registros sin alteraciones/)).toBeVisible();
  const suPdf = await inspector.request.get(
    `${WEB}${(await inspector.getByRole("link", { name: "Reporte en PDF" }).getAttribute("href")) ?? ""}`,
  );
  expect(suPdf.status()).toBe(200);
  // La API del negocio no le entrega nada: RLS solo le deja ver su reporte.
  const trabajadores = await inspector.request.get(`${WEB}/api/v1/trabajadores`);
  expect(JSON.stringify(await trabajadores.json())).not.toContain("Mariana");

  // El dueño ve lo que hizo el inspector y revoca el acceso.
  await page.reload();
  await page.getByText(/Actividad del inspector/).click();
  await expect(page.getByText(/Abrió el reporte/)).toBeVisible();
  await expect(page.getByText(/Descargó el PDF/)).toBeVisible();
  await page.getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByText("Revocado")).toBeVisible();

  await inspector.reload();
  await expect(
    inspector.getByRole("heading", { name: "Este acceso ya no está disponible" }),
  ).toBeVisible();
  await inspector.goto(enlace);
  await expect(
    inspector.getByRole("heading", { name: "Este acceso ya no está disponible" }),
  ).toBeVisible();
  await contexto.close();

  // Verificación pública con el token que solo viaja en el PDF (aquí, el que devuelve la API).
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    new Date(),
  );
  const otro = await page.request.post(`${WEB}/api/v1/reportes`, {
    data: { tipo: "periodo", desde: hoy, hasta: hoy },
  });
  expect(otro.status()).toBe(201);
  const { url_verificacion: url } = (await otro.json()) as { url_verificacion: string };
  const publico = await (await browser.newContext()).newPage();
  await publico.goto(url);
  await expect(
    publico.getByRole("heading", { name: "Los registros están íntegros" }),
  ).toBeVisible();
  await expect(publico.getByText(/1 en 1 cadena/)).toBeVisible();
  await expect(publico.getByText("Mariana")).toHaveCount(0);
});
