// Flujo completo del sprint 2: el dueño da de alta su negocio, una trabajadora
// marca desde su celular (con la red cortada) y después marca en el kiosco.
import { expect, test, type Page } from "@playwright/test";
import { aceptarDocumentos } from "./consentimiento.ts";

const WEB = "http://localhost:3000";
const KIOSCO = "http://localhost:3001";
const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Datos que un paso deja para el siguiente.
const datos = { pin: "", codigo: "", invitacion: "", pinAdmin: "" };

test.describe.configure({ mode: "serial" });

test("onboarding completo en menos de 10 minutos", async ({ page }) => {
  const inicio = Date.now();

  // Paso 1: cuenta.
  await page.goto(`${WEB}/registro`);
  await page.getByLabel("Correo").fill(`dueno-${unique}@prueba.test`);
  await page.getByLabel("Contraseña").fill(`clave-${unique}-segura`);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // Paso 2: empresa. El sector sugiere la jurisdicción.
  await expect(page.getByRole("heading", { name: "Tu empresa" })).toBeVisible();
  await page.getByLabel("Razón social o nombre del negocio").fill(`Tortillería ${unique}`);
  await page.getByLabel("Sector").selectOption("Minería");
  await expect(page.getByLabel(/^Federal/)).toBeChecked();
  await page.getByLabel("Sector").selectOption("Restaurantes y alimentos preparados");
  await expect(page.getByLabel(/^Local/)).toBeChecked();
  await page.getByRole("button", { name: "Guardar y continuar" }).click();

  // Paso 3: centro de trabajo con geocerca capturada a mano.
  await expect(page.getByRole("heading", { name: "Tu primer centro de trabajo" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Matriz");
  await page.getByLabel("Latitud").fill("19.432608");
  await page.getByLabel("Longitud").fill("-99.133209");
  await page.getByLabel("Radio (metros)").fill("150");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();

  // Paso 4: trabajadores. Se genera PIN y QR.
  await expect(page.getByRole("heading", { name: "Tu equipo" })).toBeVisible();
  await page.getByLabel("Nombre completo").fill("Mariana López");
  await page.getByLabel("Puesto").fill("Cajera");
  await page.getByRole("button", { name: "Agregar persona" }).click();
  const pin = page.locator("p.tracking-widest").first();
  await expect(pin).toHaveText(/^\d{4}$/);
  datos.pin = (await pin.textContent()) ?? "";
  await expect(page.getByAltText("QR de Mariana López")).toBeVisible();
  await page.getByRole("link", { name: "Continuar" }).click();

  // Paso 5: método de marcaje. Con kiosco se genera el código de enlace.
  await expect(page.getByRole("heading", { name: "¿Cómo va a marcar tu equipo?" })).toBeVisible();
  await page.getByLabel(/^Ambos/).check();
  await page.getByLabel("Tomar foto al marcar en el kiosco").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  const codigo = page.locator("section p.tracking-widest").first();
  await expect(codigo).toHaveText(/^[A-Z0-9]{8}$/);
  datos.codigo = (await codigo.textContent()) ?? "";
  await page.getByRole("link", { name: "Continuar" }).click();

  // Paso 6: resumen y panel.
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("heading", { name: `Tortillería ${unique}` })).toBeVisible();
  await expect(page.getByText("Sin marcas hoy")).toBeVisible();

  // Desde el panel se invita a la trabajadora a marcar con su celular.
  await page.getByRole("button", { name: "Invitar a marcar desde su celular" }).click();
  const enlace = page.getByText(/\/invitacion\//);
  await expect(enlace).toBeVisible();
  datos.invitacion = (await enlace.textContent()) ?? "";

  // Y se genera el PIN de administrador del kiosco, que se pide para desvincular una tablet.
  await page.getByRole("button", { name: "Nuevo PIN de administrador" }).click();
  const pinAdmin = page.getByRole("status").locator("p.tracking-widest");
  await expect(pinAdmin).toHaveText(/^\d{6}$/);
  datos.pinAdmin = (await pinAdmin.textContent()) ?? "";

  expect(Date.now() - inicio).toBeLessThan(10 * 60_000);
});

async function activarAcceso(page: Page) {
  await page.goto(datos.invitacion);
  await expect(page.getByRole("heading", { name: "Hola, Mariana" })).toBeVisible();
  await page.getByLabel("Tu correo").fill(`mariana-${unique}@prueba.test`);
  await page.getByLabel("Tu PIN de 4 dígitos").fill(datos.pin);
  await page.getByRole("button", { name: "Activar mi acceso" }).click();
  await aceptarDocumentos(page, "mariana lopez");
  await expect(page.getByRole("heading", { name: "Hola, Mariana" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar entrada" })).toBeVisible();
}

test("marcaje en la PWA con la red cortada y envío al recuperarla", async ({ page, context }) => {
  expect(datos.invitacion).not.toBe("");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 19.4327, longitude: -99.1333, accuracy: 12 });
  await activarAcceso(page);

  // Se corta la red: la marca se guarda en el teléfono y queda pendiente.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/Entrada guardada en este teléfono a las \d{2}:\d{2}/)).toBeVisible();
  await expect(page.getByText("1 marca pendiente de enviar")).toBeVisible();
  await expect(page.getByText("Sin conexión")).toBeVisible();
  // Ya cuenta como entrada: lo siguiente es la salida.
  await expect(page.getByRole("button", { name: "Registrar salida" })).toBeVisible();

  // Vuelve la red: la cola se envía sola y la marca aparece en la semana.
  await context.setOffline(false);
  await expect(page.getByText("1 marca pendiente de enviar")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sin conexión")).toBeHidden();
  await expect(page.getByText(/\d{2}:\d{2} → …/)).toBeVisible();

  // Recargar no duplica nada ni pierde el estado.
  await page.reload();
  await expect(page.getByRole("button", { name: "Registrar salida" })).toBeVisible();
  await expect(page.getByText(/Último registro: entrada/)).toBeVisible();
});

test("vinculación y marcaje en el kiosco", async ({ page }) => {
  expect(datos.codigo).not.toBe("");
  await page.goto(KIOSCO);
  await expect(page.getByRole("heading", { name: "Vincular este kiosco" })).toBeVisible();

  await page.getByLabel("Código de enlace").fill("ZZZZ9999");
  await page.getByRole("button", { name: "Vincular" }).click();
  await expect(page.getByText(/no es válido/)).toBeVisible();

  await page.getByLabel("Código de enlace").fill(datos.codigo.toLowerCase());
  await page.getByRole("button", { name: "Vincular" }).click();
  await expect(page.getByText("Teclea tu PIN")).toBeVisible();
  await expect(page.getByText(new RegExp(`Tortillería ${unique} · Matriz`, "i"))).toBeVisible();

  const teclear = async (digitos: string) => {
    for (const digito of digitos)
      await page.getByRole("button", { name: digito, exact: true }).click();
  };

  // Un PIN desconocido no registra nada.
  await teclear(datos.pin === "0000" ? "1111" : "0000");
  await expect(page.getByText("No se registró")).toBeVisible();
  await expect(page.getByText("Teclea tu PIN")).toBeVisible({ timeout: 10_000 });

  // La trabajadora ya había marcado entrada desde su celular: aquí toca la salida.
  await teclear(datos.pin);
  await expect(page.getByText("Salida registrada")).toBeVisible();
  await expect(page.getByText("Mariana López")).toBeVisible();
  // La confirmación dura 3 segundos y vuelve al inicio.
  await expect(page.getByText("Teclea tu PIN")).toBeVisible({ timeout: 10_000 });

  // Tras recargar sigue vinculado (el token vive en IndexedDB).
  await page.reload();
  await expect(page.getByText("Teclea tu PIN")).toBeVisible();

  // Desvincular pide el PIN de administrador: uno equivocado no sirve, el correcto sí.
  await page.getByRole("button", { name: "Desvincular este kiosco" }).click();
  await expect(page.getByText("PIN de administrador (6 dígitos)")).toBeVisible();
  await teclear(datos.pinAdmin === "000000" ? "111111" : "000000");
  await expect(page.getByText("No se registró")).toBeVisible();
  await expect(page.getByText("Teclea tu PIN")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Desvincular este kiosco" }).click();
  await teclear(datos.pinAdmin);
  await expect(page.getByRole("heading", { name: "Vincular este kiosco" })).toBeVisible();
});

// Lighthouse retiró su categoría PWA (v12), así que los criterios de "instalable"
// se comprueban aquí: manifest con íconos, service worker activo y arranque sin red.
for (const app of [
  { nombre: "web", url: WEB, inicio: "/app/entrar", display: "standalone" },
  { nombre: "kiosco", url: KIOSCO, inicio: "/", display: "fullscreen" },
]) {
  test(`${app.nombre} es instalable y abre sin red`, async ({ page, context, request }) => {
    const manifest = await request.get(`${app.url}/manifest.webmanifest`);
    expect(manifest.ok()).toBe(true);
    const contenido = (await manifest.json()) as {
      name: string;
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; type: string }[];
    };
    expect(contenido.name).toMatch(/Mi Jornada/);
    expect(contenido.display).toBe(app.display);
    expect(contenido.icons.map((icono) => icono.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icono of contenido.icons) {
      const respuesta = await request.get(`${app.url}${icono.src}`);
      expect(respuesta.headers()["content-type"]).toBe("image/png");
    }

    await page.goto(`${app.url}${app.inicio}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.webmanifest/,
    );
    const controlada = await page.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      return registro.active !== null && registro.scope.endsWith("/");
    });
    expect(controlada).toBe(true);

    // Con el service worker ya activo, la pantalla vuelve a abrir sin conexión.
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await context.setOffline(false);
  });
}
