// Marcaje desde el celular cuando el centro exige foto (cámara del teléfono).
import { expect, test } from "@playwright/test";
import { aceptarDocumentos } from "./consentimiento.ts";

const WEB = "http://localhost:3000";
const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("marcaje en la PWA con foto obligatoria", async ({ page, context, browserName }) => {
  test.setTimeout(60_000);
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[${browserName}] consola:`, message.text());
  });
  page.on("pageerror", (error) => {
    console.log(`[${browserName}] error de página:`, error.message);
  });
  page.on("requestfailed", (request) => {
    console.log(
      `[${browserName}] petición fallida:`,
      request.method(),
      request.url(),
      request.failure()?.errorText,
    );
  });

  // Alta mínima con foto obligatoria en el celular.
  await page.goto(`${WEB}/registro`);
  await page.getByLabel("Correo").fill(`dueno-foto-${unique}@prueba.test`);
  await page.getByLabel("Contraseña").fill(`clave-${unique}-segura`);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Tu empresa" })).toBeVisible();
  await page.getByLabel("Razón social o nombre del negocio").fill(`Fotos ${unique}`);
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
  await page.getByLabel(/^Teléfono propio/).check();
  await page.getByLabel("Pedir foto al marcar desde el celular").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Invitar a marcar desde su celular" }).click();
  const enlace = (await page.getByText(/\/invitacion\//).textContent()) ?? "";

  // La trabajadora activa su acceso y marca: la cámara entrega una foto.
  await context.clearCookies();
  await page.goto(enlace);
  await page.getByLabel("Tu correo").fill(`mariana-foto-${unique}@prueba.test`);
  await page.getByLabel("Tu PIN de 4 dígitos").fill(pin);
  await page.getByRole("button", { name: "Activar mi acceso" }).click();
  await aceptarDocumentos(page, "Mariana López");
  await expect(page.getByRole("button", { name: "Registrar entrada" })).toBeVisible();

  const eventos = page.waitForResponse(
    (r) => r.url().includes("/api/v1/eventos") && r.request().method() === "POST",
  );
  const selector = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await (await selector).setFiles("e2e/fixtures/foto.jpg");

  await expect(page.getByText(/Entrada registrada a las \d{2}:\d{2}/)).toBeVisible({
    timeout: 20_000,
  });
  const respuesta = await eventos;
  const cuerpo = (await respuesta.json()) as {
    resultados: { estado: string; evento?: { foto_url: string | null } }[];
  };
  expect(cuerpo.resultados[0]?.estado).toBe("insertado");
  expect(cuerpo.resultados[0]?.evento?.foto_url).toMatch(/\.jpg$/);

  // La marca llegó y la foto se subió: no queda nada pendiente.
  await expect(page.getByText(/pendiente/)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Registrar salida" })).toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2} → …/)).toBeVisible();
});
