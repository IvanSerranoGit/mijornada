"use server";

import {
  accesoConPin,
  acceptInvitacion,
  ApiError,
  createInvitacion,
  invitacionAceptar,
  loginConPin,
  type AccesoConcedido,
} from "@mijornada/api";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdmin } from "../../lib/supabase/admin.ts";
import { SITE_URL } from "../../lib/supabase/env.ts";
import { createSupabaseServer, getCtx } from "../../lib/supabase/server.ts";

export interface AccesoState {
  error?: string;
}

function mensaje(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Revisa los datos.";
  throw error;
}

/** Abre la sesión del trabajador en las cookies de esta petición. */
async function abrirSesion(concedido: AccesoConcedido): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: concedido.tokenHash,
    type: "email",
  });
  return error ? "No se pudo abrir la sesión. Intenta de nuevo." : null;
}

export async function activarAcceso(_prev: AccesoState, formData: FormData): Promise<AccesoState> {
  try {
    const datos = invitacionAceptar.parse({
      token: formData.get("token"),
      correo: formData.get("correo"),
      pin: formData.get("pin"),
    });
    const error = await abrirSesion(await acceptInvitacion(createSupabaseAdmin(), datos));
    if (error) return { error };
  } catch (error) {
    return { error: mensaje(error) };
  }
  redirect("/app");
}

export async function entrarConPin(_prev: AccesoState, formData: FormData): Promise<AccesoState> {
  try {
    const datos = accesoConPin.parse({ correo: formData.get("correo"), pin: formData.get("pin") });
    const error = await abrirSesion(await loginConPin(createSupabaseAdmin(), datos));
    if (error) return { error };
  } catch (error) {
    return { error: mensaje(error) };
  }
  redirect("/app");
}

/** Genera el enlace de invitación de un trabajador (lo llama el dueño desde su panel). */
export async function invitar(trabajadorId: string): Promise<{ enlace?: string; error?: string }> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Inicia sesión para continuar." };
  try {
    const { token } = await createInvitacion(ctx, trabajadorId);
    return { enlace: `${SITE_URL}/invitacion/${token}` };
  } catch (error) {
    return { error: mensaje(error) };
  }
}
