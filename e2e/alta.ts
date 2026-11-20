import { expect, type Page } from "@playwright/test";

export const WEB = "http://localhost:3000";
export const KIOSCO = "http://localhost:3001";

export const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface Alta {
  id: string;
  /** PIN de la trabajadora Mariana López. */
  pin: string;
  /** Enlace de invitación para que marque desde su celular. */
  invitacion: string;
  correoDueno: string;
  clave: string;
}

/**
 * Alta mínima por la interfaz: cuenta del dueño, empresa, centro "Matriz", la trabajadora
 * Mariana López marcando desde su celular (sin foto) y su invitación. Deja la sesión del
 * dueño abierta en el panel.
 */
export async function altaEmpresa(page: Page, nombre: string): Promise<Alta> {
  const id = unico();
  const correoDueno = `dueno-${id}@prueba.test`;
  const clave = `clave-${id}-segura`;
  await page.goto(`${WEB}/registro`);
  await page.getByLabel("Correo").fill(correoDueno);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Tu empresa" })).toBeVisible();
  await page.getByLabel("Razón social o nombre del negocio").fill(`${nombre} ${id}`);
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
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByRole("link", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Invitar a marcar desde su celular" }).click();
  const invitacion = (await page.getByText(/\/invitacion\//).textContent()) ?? "";
  return { id, pin, invitacion, correoDueno, clave };
}

/** La trabajadora activa su acceso en un contexto aparte (su celular). */
export async function activarAcceso(celular: Page, alta: Alta) {
  await celular.goto(alta.invitacion);
  await celular.getByLabel("Tu correo").fill(`mariana-${alta.id}@prueba.test`);
  await celular.getByLabel("Tu PIN de 4 dígitos").fill(alta.pin);
  await celular.getByRole("button", { name: "Activar mi acceso" }).click();
}
