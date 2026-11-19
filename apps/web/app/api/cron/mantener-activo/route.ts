import { errorResponseFrom, listReglas, type Ctx } from "@mijornada/api";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin.ts";

// El plan gratuito de Supabase pausa un proyecto tras 7 días sin peticiones.
// Vercel Cron llama a esta ruta cada día con `Authorization: Bearer $CRON_SECRET`
// y hace la misma consulta que GET /api/v1/reglas (esa ruta pide sesión de
// usuario, que un cron no tiene). Quitar cuando empiece el piloto.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ codigo: "no_autenticado", mensaje: "No autorizado." }, { status: 401 });
  }
  try {
    const ctx: Ctx = {
      db: createSupabaseAdmin(),
      sesion: {
        authUserId: "cron",
        tenantId: null,
        rol: null,
        usuarioId: null,
        centroId: null,
        trabajadorId: null,
      },
    };
    const reglas = await listReglas(ctx);
    return Response.json({ activo: true, reglas: reglas.length });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
