"use server";

import { ApiError, createCodigoEnlace, createPinAdmin } from "@mijornada/api";
import { getCtx } from "../../lib/supabase/server.ts";

export interface Secreto {
  valor?: string;
  error?: string;
}

async function run(
  fn: (ctx: NonNullable<Awaited<ReturnType<typeof getCtx>>>) => Promise<string>,
): Promise<Secreto> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Inicia sesión para continuar." };
  try {
    return { valor: await fn(ctx) };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}

/** PIN de administrador del kiosco nuevo; el anterior deja de servir. */
export async function nuevoPinAdmin(centroId: string): Promise<Secreto> {
  return run(async (ctx) => (await createPinAdmin(ctx, centroId)).pin_admin);
}

/** Código de enlace para vincular una tablet más al centro. */
export async function nuevoCodigoEnlace(centroId: string): Promise<Secreto> {
  return run(async (ctx) => (await createCodigoEnlace(ctx, centroId)).codigo);
}
