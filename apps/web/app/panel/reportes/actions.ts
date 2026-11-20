"use server";

import {
  createAccesoInspector,
  createReporte,
  reporteCrear,
  revokeAccesoInspector,
} from "@mijornada/api";
import { z } from "zod";
import { campo, ejecutar, type Resultado } from "../../../lib/acciones.ts";
import { servicios } from "../../../lib/servicios.ts";
import { SITE_URL } from "../../../lib/supabase/env.ts";

/** Genera un reporte: PDF y CSV guardados, con sus huellas. */
export async function generar(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    const trabajador = campo(formData, "trabajador_id");
    const centro = campo(formData, "centro_id");
    await createReporte(
      ctx,
      reporteCrear.parse({
        tipo: campo(formData, "tipo"),
        desde: campo(formData, "desde"),
        hasta: campo(formData, "hasta"),
        ...(centro === undefined ? {} : { centro_id: centro }),
        ...(trabajador === undefined ? {} : { trabajador_ids: [trabajador] }),
      }),
      servicios,
      SITE_URL,
    );
    return "Reporte generado. Lo encuentras abajo.";
  });
}

export interface EnlaceInspector {
  enlace?: string;
  error?: string;
}

/** Crea un enlace de inspector para un reporte. Solo se muestra esta vez. */
export async function compartir(
  _previo: EnlaceInspector,
  formData: FormData,
): Promise<EnlaceInspector> {
  let enlace = "";
  const resultado = await ejecutar(async (ctx) => {
    const acceso = await createAccesoInspector(
      ctx,
      z.uuid().parse(formData.get("reporte_id")),
      servicios,
      SITE_URL,
    );
    enlace = acceso.enlace;
    return "ok";
  });
  return resultado.error ? { error: resultado.error } : { enlace };
}

export async function revocar(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    await revokeAccesoInspector(ctx, z.uuid().parse(formData.get("acceso_id")));
    return "Acceso revocado.";
  });
}
