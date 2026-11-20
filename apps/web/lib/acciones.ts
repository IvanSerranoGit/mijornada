import "server-only";
import { ApiError, type Ctx } from "@mijornada/api";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "./supabase/server.ts";

/** Resultado de una acción de formulario: un mensaje de éxito o uno de error. */
export interface Resultado {
  ok?: string;
  error?: string;
}

/**
 * Ejecuta una acción del servidor con la sesión de quien llama y convierte los errores
 * esperados (de la API o de validación) en un mensaje para el formulario.
 */
export async function ejecutar(
  fn: (ctx: Ctx) => Promise<string>,
  revalidar = "/panel",
): Promise<Resultado> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Tu sesión terminó. Vuelve a entrar." };
  try {
    const ok = await fn(ctx);
    revalidatePath(revalidar, "layout");
    return { ok };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message ?? "Revisa los datos." };
    throw error;
  }
}

/** Texto de un campo de formulario, o undefined si viene vacío. */
export function campo(formData: FormData, nombre: string): string | undefined {
  const valor = formData.get(nombre);
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}
