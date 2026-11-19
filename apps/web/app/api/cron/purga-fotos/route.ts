import { errorResponseFrom, purgarFotos } from "@mijornada/api";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin.ts";

// Vercel Cron llama a esta ruta cada día con `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ codigo: "no_autenticado", mensaje: "No autorizado." }, { status: 401 });
  }
  try {
    return Response.json(await purgarFotos(createSupabaseAdmin()));
  } catch (error) {
    return errorResponseFrom(error);
  }
}
