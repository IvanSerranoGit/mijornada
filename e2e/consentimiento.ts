import { expect, type Page } from "@playwright/test";

/**
 * Primer acceso a la PWA: la persona lee el aviso simplificado y el convenio (hay que
 * llegar al final) y acepta con su nombre completo.
 */
export async function aceptarDocumentos(page: Page, nombre: string) {
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await expect(page.getByText(/usará tu nombre, puesto, horario/)).toBeVisible();
  // Sin leer el convenio completo no se puede aceptar.
  await expect(page.getByRole("button", { name: "Acepto" })).toBeDisabled();
  await page.getByTestId("fin-del-convenio").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Para aceptar, escribe tu nombre completo")).toBeEnabled();

  await page.getByLabel("Para aceptar, escribe tu nombre completo").fill("Otra Persona");
  await page.getByRole("button", { name: "Acepto" }).click();
  await expect(page.getByText(/no coincide con el registrado/)).toBeVisible();

  await page.getByLabel("Para aceptar, escribe tu nombre completo").fill(nombre);
  await page.getByRole("button", { name: "Acepto" }).click();
}
