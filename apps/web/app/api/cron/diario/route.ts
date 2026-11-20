import {
  createStripe,
  enviarAvisosPendientes,
  errorResponseFrom,
  purgarFotos,
  sincronizarAsientos,
} from "@mijornada/api";
import { enviarCorreo } from "../../../../lib/correo.ts";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin.ts";
import { SITE_URL } from "../../../../lib/supabase/env.ts";

export const maxDuration = 60;

// Tareas diarias del servidor (Vercel Cron, con `Authorization: Bearer $CRON_SECRET`):
// purga de fotos de más de 90 días, avisos por correo que tocan hoy y ajuste de personas
// adicionales en Stripe. Es una sola ruta para no depender de cuántos cron permite el plan.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ codigo: "no_autenticado", mensaje: "No autorizado." }, { status: 401 });
  }
  try {
    const admin = createSupabaseAdmin();
    const fotos = await purgarFotos(admin);
    const avisos = await enviarAvisosPendientes(admin, enviarCorreo, SITE_URL);
    const llave = process.env["STRIPE_SECRET_KEY"];
    const asientos = llave
      ? await sincronizarAsientos(admin, createStripe(llave))
      : { ajustadas: 0 };
    return Response.json({ fotos, avisos, asientos });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
