"use server";

import {
  accesoConPin,
  acceptInvitacion,
  ApiError,
  CORREOS,
  createInvitacion,
  getEmpresa,
  invitacionAceptar,
  loginConPin,
  type AccesoConcedido,
} from "@mijornada/api";
import { redirect } from "next/navigation";
import { z } from "zod";
import { enviarCorreo } from "../../lib/correo.ts";
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

const invitacionPorCorreo = z.object({
  trabajadorId: z.uuid(),
  enlace: z.url().startsWith(`${SITE_URL}/invitacion/`),
  correo: z.email("Escribe un correo válido."),
});

/** Envía por correo a la persona el enlace de invitación que se acaba de generar. */
export async function enviarInvitacion(
  trabajadorId: string,
  enlace: string,
  correo: string,
): Promise<{ ok?: string; error?: string }> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Inicia sesión para continuar." };
  try {
    const datos = invitacionPorCorreo.parse({ trabajadorId, enlace, correo });
    // RLS: solo quien administra a esa persona puede leer su nombre.
    const { data: trabajador } = await ctx.db
      .schema("tenants")
      .from("trabajador")
      .select("nombre, tenant_id")
      .eq("id", datos.trabajadorId)
      .maybeSingle();
    if (!trabajador) return { error: "La persona no existe o no tienes acceso." };
    const empresa = await getEmpresa(ctx, trabajador.tenant_id);
    const enviado = await enviarCorreo(
      CORREOS.invitacionTrabajador(datos.correo, {
        nombre: trabajador.nombre.split(" ")[0] ?? trabajador.nombre,
        empresa: empresa.razon_social,
        enlace: datos.enlace,
      }),
    );
    return enviado
      ? { ok: `Invitación enviada a ${datos.correo}.` }
      : { error: "No se pudo enviar el correo. Comparte el enlace por otro medio." };
  } catch (error) {
    return { error: mensaje(error) };
  }
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
