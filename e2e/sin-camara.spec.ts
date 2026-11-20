// Kiosco sin cámara en un centro que pide foto: la marca se registra igual, queda
// como "sin cámara" y el panel del dueño avisa.
import { expect, test } from "@playwright/test";

const WEB = "http://localhost:3000";
const KIOSCO = "http://localhost:3001";
const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("kiosco sin cámara: marca sin foto y el panel lo avisa", async ({ page, browser }) => {
  test.setTimeout(90_000);

  // Alta mínima con kiosco y foto obligatoria en el kiosco.
  await page.goto(`${WEB}/registro`);
  await page.getByLabel("Correo").fill(`dueno-camara-${unique}@prueba.test`);
  await page.getByLabel("Contraseña").fill(`clave-${unique}-segura`);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Tu empresa" })).toBeVisible();
  await page.getByLabel("Razón social o nombre del negocio").fill(`Sin cámara ${unique}`);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tu primer centro de trabajo" })).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill("Matriz");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tu equipo" })).toBeVisible();
  await page.getByLabel("Nombre completo").fill("Mariana López");
  await page.getByRole("button", { name: "Agregar persona" }).click();
  const pin = (await page.locator("p.tracking-widest").first().textContent()) ?? "";
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo va a marcar tu equipo?" })).toBeVisible();
  await page.getByLabel(/^Kiosco/).check();
  await page.getByLabel("Tomar foto al marcar en el kiosco").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  const codigo = page.locator("section p.tracking-widest").first();
  await expect(codigo).toHaveText(/^[A-Z0-9]{8}$/);
  const enlace = (await codigo.textContent()) ?? "";
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByText("Sin marcas hoy")).toBeVisible();
  await expect(page.getByText(/no tiene cámara/)).toBeHidden();

  // La tablet no tiene cámara: el navegador rechaza el acceso.
  const tablet = await browser.newContext();
  await tablet.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Requested device not found", "NotFoundError"));
  });
  const kiosco = await tablet.newPage();
  await kiosco.goto(KIOSCO);
  await kiosco.getByLabel("Código de enlace").fill(enlace);
  await kiosco.getByRole("button", { name: "Vincular" }).click();
  await expect(kiosco.getByText("Teclea tu PIN")).toBeVisible();
  for (const digito of pin) await kiosco.getByRole("button", { name: digito, exact: true }).click();
  // Primera marca de esta persona: el kiosco muestra el aviso de privacidad.
  await expect(kiosco.getByRole("heading", { name: "Hola, Mariana López" })).toBeVisible();
  await expect(kiosco.getByText(/usará tu nombre, puesto, horario/)).toBeVisible();
  await kiosco.getByRole("button", { name: "Acepto y marco" }).click();
  await expect(kiosco.getByText("Entrada registrada")).toBeVisible();
  await tablet.close();

  // El panel avisa en el centro y en la semana de la trabajadora.
  await page.reload();
  await expect(page.getByText(/El kiosco de este centro no tiene cámara/)).toBeVisible();
  await expect(page.getByText("Foto no disponible en 1 marca de esta semana.")).toBeVisible();

  // El aviso quedó aceptado en el kiosco; el convenio sigue pendiente hasta que lo firme.
  await page.getByRole("link", { name: "Documentos" }).click();
  await expect(page.getByRole("heading", { name: "Documentos", exact: true })).toBeVisible();
  await expect(page.getByText("aceptó en el kiosco", { exact: false })).toBeVisible();
  await expect(page.getByText("Consentimiento pendiente")).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Descargar PDF en blanco para imprimir" })
    .first()
    .getAttribute("href");
  const pdf = await page.request.get(`${WEB}${href ?? ""}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
