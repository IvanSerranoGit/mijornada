"use server";

import { acceptInvitacionUsuario, ApiError, invitacionUsuarioAceptar } from "@mijornada/api";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdmin } from "../../../lib/supabase/admin.ts";
import { createSupabaseServer } from "../../../lib/supabase/server.ts";

export interface Estado {
  error?: string;
}

/** La persona invitada fija su contraseña y entra al panel. */
export async function aceptar(_previo: Estado, formData: FormData): Promise<Estado> {
  try {
    const datos = invitacionUsuarioAceptar.parse({
      token: formData.get("token"),
      contrasena: formData.get("contrasena"),
    });
    const { correo } = await acceptInvitacionUsuario(createSupabaseAdmin(), datos);
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: datos.contrasena,
    });
    if (error)
      return {
        error: "Tu contraseña quedó guardada. Entra con tu correo desde la página de inicio.",
      };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message ?? "Revisa los datos." };
    throw error;
  }
  redirect("/panel");
}
