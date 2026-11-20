// Recorrido del sprint 3 en una sola pantalla de celular: consentimiento → incidencia →
// reporte → inspector. Es la prueba de humo del flujo completo y, con DEMO=1 (pausas entre
// pasos), el video de demostración: docs/demo/sprint-3-flujo.mp4.
import { expect, test, type Page } from "@playwright/test";
import { activarAcceso, altaEmpresa, WEB } from "./alta.ts";
import { aceptarDocumentos } from "./consentimiento.ts";

const pausa = (page: Page, ms = 1200) =>
  process.env["DEMO"] ? page.waitForTimeout(ms) : Promise.resolve();

test("recorrido: consentimiento, incidencia, reporte e inspector", async ({ page, context }) => {
  test.setTimeout(240_000);
  const alta = await altaEmpresa(page, "Abarrotes");
  await pausa(page);

  // 1. Consentimiento: la trabajadora activa su acceso, lee y acepta con su nombre.
  await context.clearCookies();
  await activarAcceso(page, alta);
  await pausa(page, 2000);
  await aceptarDocumentos(page, "Mariana López");
  await expect(page.getByRole("button", { name: "Registrar entrada" })).toBeVisible();
  await pausa(page);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/Entrada registrada a las/)).toBeVisible();
  await pausa(page, 1800);

  // 2. Incidencia: reporta que ayer olvidó marcar su salida.
  const ayer = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    new Date(Date.now() - 86_400_000),
  );
  await page.getByRole("link", { name: /Olvidaste marcar/ }).click();
  await page.getByLabel("Marca que faltó").selectOption("salida");
  await page.getByLabel("Fecha").fill(ayer);
  await page.getByLabel("Hora en que ocurrió").fill("18:00");
  await page.getByLabel("Motivo").fill("Olvidé marcar al salir");
  await pausa(page);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("En revisión")).toBeVisible();
  await pausa(page, 1800);

  // El dueño entra, la aprueba y revisa los consentimientos.
  await context.clearCookies();
  await page.goto(`${WEB}/entrar`);
  await page.getByLabel("Correo").fill(alta.correoDueno);
  await page.getByLabel("Contraseña").fill(alta.clave);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Abarrotes/ })).toBeVisible();
  await pausa(page);
  await page.getByRole("link", { name: "Incidencias" }).click();
  await expect(page.getByText("La pidió el trabajador")).toBeVisible();
  await pausa(page, 1800);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("No hay incidencias pendientes.")).toBeVisible();
  await pausa(page);
  await page.getByRole("link", { name: "Documentos" }).click();
  await expect(page.getByText("1 de 1 lo aceptaron").first()).toBeVisible();
  await pausa(page, 1800);

  // 3. Reporte para inspección y enlace de inspector.
  await page.getByRole("link", { name: "Reportes" }).click();
  await page.getByLabel("Desde").fill(ayer);
  await pausa(page);
  await page.getByRole("button", { name: "Generar reporte" }).click();
  await expect(page.getByText("Reporte generado. Lo encuentras abajo.")).toBeVisible({
    timeout: 60_000,
  });
  await pausa(page, 1800);
  await page.getByRole("button", { name: "Crear enlace para inspector" }).click();
  const enlace = (await page.getByText(/\/inspector\/[0-9a-f]{48}/).textContent()) ?? "";
  await pausa(page, 1800);

  // 4. El inspector abre el enlace: verificación e integridad, sin cuenta.
  await context.clearCookies();
  await page.goto(enlace);
  await expect(page.getByText("Registros íntegros")).toBeVisible();
  await expect(page.getByText(/2 registros sin alteraciones/)).toBeVisible();
  await pausa(page, 2500);
  await page
    .goto(
      `${WEB}${(await page.getByRole("link", { name: "Reporte en PDF" }).getAttribute("href")) ?? ""}`,
    )
    .catch(() => null);
  await pausa(page, 2500);
});
