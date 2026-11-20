"use server";

import { resolveIncidencia } from "@mijornada/api";
import { z } from "zod";
import { campo, ejecutar, type Resultado } from "../../../lib/acciones.ts";
import { abrirDesdeFormulario } from "../../../lib/incidencias.ts";

/** Aprueba o rechaza una incidencia. Al aprobar, la base inserta el evento que corresponde. */
export async function resolver(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    const aprobar = formData.get("decision") === "aprobar";
    await resolveIncidencia(ctx, z.uuid().parse(formData.get("id")), aprobar);
    return aprobar ? "Incidencia aprobada." : "Incidencia rechazada.";
  });
}

/** El patrón abre una incidencia a nombre de una persona; queda pendiente de su conformidad. */
export async function abrir(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    await abrirDesdeFormulario(ctx, formData, campo(formData, "trabajador_id"));
    return "Incidencia abierta. Apruébala aquí mismo; la persona podrá dar su conformidad desde su celular.";
  });
}
