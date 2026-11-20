// Página de inicio en móvil: lo que debe ver un desconocido que llega al sitio.
import { expect, test } from "@playwright/test";
import { WEB } from "./alta.ts";

test("landing en móvil: propuesta, precios, preguntas, legales y registro", async ({
  page,
  request,
}) => {
  await page.goto(WEB);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Cumple con el registro de jornada que pide la STPS en 10 minutos",
  );
  await expect(page.getByText("Obligatorio desde el 1 de enero de 2027")).toBeVisible();
  // Sin desbordes horizontales en un celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  for (const plan of ["Básico", "Negocio", "Crecimiento"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  await expect(page.getByText("$299")).toBeVisible();
  await page.getByText("¿Qué pasa si no hay internet?").click();
  await expect(page.getByText(/se envía sola cuando vuelve la conexión/)).toBeVisible();

  // Las páginas legales existen y llevan los datos de quien opera el servicio.
  await page.getByRole("link", { name: "Términos de servicio" }).click();
  await expect(
    page.getByRole("heading", { name: "Términos de servicio de Mi Jornada" }),
  ).toBeVisible();
  await expect(page.getByText(/IST170829174/).first()).toBeVisible();
  await page.goto(`${WEB}/privacidad`);
  await expect(
    page.getByRole("heading", { name: "Aviso de privacidad de Mi Jornada" }),
  ).toBeVisible();

  expect((await request.get(`${WEB}/sitemap.xml`)).status()).toBe(200);
  expect(await (await request.get(`${WEB}/robots.txt`)).text()).toContain("Disallow: /panel");
  expect((await request.get(`${WEB}/opengraph-image`)).headers()["content-type"]).toBe("image/png");

  // Y de ahí, al registro.
  await page.goto(WEB);
  await page.getByRole("link", { name: /Probar gratis 14 días/ }).click();
  await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Términos de servicio" })).toBeVisible();
});
