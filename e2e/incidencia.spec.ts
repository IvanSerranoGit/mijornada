// Incidencias: la trabajadora reporta dos olvidos, el dueño los aprueba, el día se
// recalcula y la vista del día muestra el rastro. Después el dueño corrige una hora y la
// trabajadora manifiesta su inconformidad.
import { expect, test } from "@playwright/test";
import { activarAcceso, altaEmpresa, WEB } from "./alta.ts";
import { aceptarDocumentos } from "./consentimiento.ts";

const ayer = () => {
  const fecha = new Date(Date.now() - 24 * 3_600_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(fecha);
};

test("incidencia abierta por la trabajadora y aprobada por el dueño, con el día recalculado", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const alta = await altaEmpresa(page, "Incidencias");
  const fecha = ayer();

  const contexto = await browser.newContext();
  const celular = await contexto.newPage();
  await activarAcceso(celular, alta);
  await aceptarDocumentos(celular, "Mariana López");
  await celular.getByRole("link", { name: /Olvidaste marcar/ }).click();
  await expect(celular.getByRole("heading", { name: "Incidencias" })).toBeVisible();

  // Dos olvidos de ayer: entrada 09:00 y salida 17:30.
  for (const [marca, hora] of [
    ["entrada", "09:00"],
    ["salida", "17:30"],
  ] as const) {
    await celular.getByLabel("¿Qué pasó?").selectOption("olvido");
    await celular.getByLabel("Marca que faltó").selectOption(marca);
    await celular.getByLabel("Fecha").fill(fecha);
    await celular.getByLabel("Hora en que ocurrió").fill(hora);
    await celular.getByLabel("Motivo").fill(`Olvidé marcar la ${marca}`);
    await celular.getByRole("button", { name: "Enviar" }).click();
    await expect(celular.getByText(`“Olvidé marcar la ${marca}”`)).toBeVisible();
  }
  await expect(celular.getByText("En revisión")).toHaveCount(2);

  // El dueño las ve en su bandeja y las aprueba.
  await page.getByRole("link", { name: "Incidencias" }).click();
  await expect(page.getByText("La pidió el trabajador")).toHaveCount(2);
  await page.getByRole("button", { name: "Aprobar" }).first().click();
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(1);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("No hay incidencias pendientes.")).toBeVisible();

  // El día se recalculó con las horas declaradas: 8 h 30 min, marcado como corregido.
  const trabajadores = await page.request.get(`${WEB}/api/v1/trabajadores`);
  const { datos } = (await trabajadores.json()) as { datos: { id: string }[] };
  const trabajadorId = datos[0]?.id ?? "";
  const dias = await page.request.get(
    `${WEB}/api/v1/dias?trabajador_id=${trabajadorId}&desde=${fecha}&hasta=${fecha}`,
  );
  expect(await dias.json()).toMatchObject([
    { fecha, minutos_trabajados: 510, estado: "corregido" },
  ]);

  // La vista del día enseña que no hubo marca original y la hora declarada, con quién autorizó.
  await page.goto(`${WEB}/panel/dia?trabajador=${trabajadorId}&fecha=${fecha}`);
  await expect(page.getByText("No se marcó")).toHaveCount(2);
  await expect(page.getByText("17:30")).toBeVisible();
  await expect(page.getByText(`Autorizó ${alta.correoDueno}`).first()).toBeVisible();
  await expect(page.getByText(/Con conformidad del trabajador/).first()).toBeVisible();

  // Ahora el dueño corrige la salida a las 18:00; queda sin conformidad hasta que ella responda.
  await page.goto(`${WEB}/panel/incidencias`);
  await page.getByLabel("Persona").selectOption({ label: "Mariana López" });
  await page.getByLabel("¿Qué pasó?").selectOption("correccion_hora");
  await page.getByLabel("Marca que se corrige").selectOption({ index: 1 });
  await page.getByLabel("Hora correcta").fill("18:00");
  await page.getByLabel("Motivo").fill("Se quedó a cerrar caja");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Sin conformidad del trabajador")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("No hay incidencias pendientes.")).toBeVisible();

  await celular.reload();
  await expect(celular.getByText("La abrió tu empresa. Dinos si estás de acuerdo.")).toBeVisible();
  await celular.getByRole("button", { name: "No estoy de acuerdo" }).click();
  await expect(celular.getByText("Explica por qué no estás de acuerdo.")).toBeVisible();
  await celular.getByLabel(/^Comentario/).fill("Salí a las 17:30");
  await celular.getByRole("button", { name: "No estoy de acuerdo" }).click();
  await expect(celular.getByText(/No estuviste de acuerdo: “Salí a las 17:30”/)).toBeVisible();

  await page.goto(`${WEB}/panel/dia?trabajador=${trabajadorId}&fecha=${fecha}`);
  await expect(page.getByText("El trabajador no está de acuerdo")).toBeVisible();
  await expect(page.getByText("Comentario del trabajador: “Salí a las 17:30”")).toBeVisible();
  await contexto.close();
});
