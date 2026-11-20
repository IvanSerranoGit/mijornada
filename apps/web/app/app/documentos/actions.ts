"use server";

import { acceptDocumento, ApiError, getMisDocumentos, origenDe } from "@mijornada/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_URL } from "../../../lib/supabase/env.ts";
import { getCtx } from "../../../lib/supabase/server.ts";

export interface Resultado {
  error?: string;
}

/** Firma simple: acepta los documentos vigentes que la persona tenga pendientes. */
export async function aceptarDocumentos(
  _previo: Resultado,
  formData: FormData,
): Promise<Resultado> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Tu sesión terminó. Vuelve a entrar." };
  const nombre = formData.get("nombre");
  if (typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "Escribe tu nombre completo." };
  }
  try {
    const origen = origenDe(await headers());
    const { documentos } = await getMisDocumentos(ctx, SITE_URL);
    for (const documento of documentos.filter((d) => !d.aceptado)) {
      await acceptDocumento(ctx, documento.id, nombre, origen);
    }
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  redirect("/app");
}
