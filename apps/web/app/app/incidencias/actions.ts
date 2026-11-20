"use server";

import { ApiError, incidenciaResponder, respondIncidencia } from "@mijornada/api";
import { z } from "zod";
import { campo, ejecutar, type Resultado } from "../../../lib/acciones.ts";
import { abrirDesdeFormulario } from "../../../lib/incidencias.ts";

/** El trabajador abre una incidencia propia; nace con su conformidad. */
export async function abrir(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    if (ctx.sesion.trabajadorId === null)
      throw new ApiError(403, "sin_permiso", "Solo para trabajadores.");
    await abrirDesdeFormulario(ctx, formData, ctx.sesion.trabajadorId);
    return "Enviada. Tu empresa la revisará y aquí verás la respuesta.";
  }, "/app");
}

/** Conformidad o inconformidad con una incidencia que abrió el patrón. */
export async function responder(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    const respuesta = incidenciaResponder.parse({
      conforme: formData.get("respuesta") === "conforme",
      comentario: campo(formData, "comentario"),
    });
    await respondIncidencia(ctx, z.uuid().parse(formData.get("id")), respuesta);
    return respuesta.conforme
      ? "Quedó registrada tu conformidad."
      : "Quedó registrada tu inconformidad.";
  }, "/app");
}
