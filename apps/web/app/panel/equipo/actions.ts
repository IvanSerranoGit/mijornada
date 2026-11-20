"use server";

import { inviteUsuario, usuarioInvitar } from "@mijornada/api";
import { campo, ejecutar } from "../../../lib/acciones.ts";
import { servicios } from "../../../lib/servicios.ts";
import { SITE_URL } from "../../../lib/supabase/env.ts";

export interface Invitacion {
  ok?: string;
  error?: string;
  /** Enlace para compartir a mano cuando el correo no se pudo enviar. */
  enlace?: string;
}

/** Invita a un administrador o supervisor y le envía el enlace para fijar su contraseña. */
export async function invitar(_previo: Invitacion, formData: FormData): Promise<Invitacion> {
  let enlace: string | undefined;
  const resultado = await ejecutar(async (ctx) => {
    const invitado = await inviteUsuario(
      ctx,
      usuarioInvitar.parse({
        correo: campo(formData, "correo") ?? "",
        nombre: campo(formData, "nombre") ?? "",
        rol: campo(formData, "rol"),
        ...(campo(formData, "centro_id") === undefined
          ? {}
          : { centro_id: campo(formData, "centro_id") }),
      }),
      servicios,
      SITE_URL,
    );
    if (invitado.correo_enviado) return `Invitación enviada a ${invitado.correo}.`;
    enlace = invitado.enlace;
    return "No se pudo enviar el correo. Comparte este enlace con la persona; vence en 7 días.";
  });
  return { ...resultado, ...(enlace === undefined ? {} : { enlace }) };
}
