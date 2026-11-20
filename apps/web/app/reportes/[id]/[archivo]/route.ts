import {
  ApiError,
  ARCHIVOS_REPORTE,
  downloadReporte,
  errorResponse,
  origenDe,
  type ArchivoReporte,
} from "@mijornada/api";
import { z } from "zod";
import { getCtx } from "../../../../lib/supabase/server.ts";

// Descarga de un archivo de un reporte (pdf, eventos, dias). La autoriza el bucket con
// los permisos de quien llama: un administrador del tenant o el inspector de ese reporte,
// cuya descarga queda en la bitácora.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; archivo: string }> },
) {
  try {
    const ctx = await getCtx();
    if (ctx === null) throw new ApiError(401, "no_autenticado", "Inicia sesión para continuar.");
    const { id, archivo } = await params;
    if (!Object.hasOwn(ARCHIVOS_REPORTE, archivo)) {
      throw new ApiError(404, "no_encontrado", "El archivo no existe.");
    }
    const descarga = await downloadReporte(
      ctx,
      z.uuid().parse(id),
      archivo as ArchivoReporte,
      origenDe(request.headers).ip,
    );
    return new Response(new Uint8Array(descarga.cuerpo), {
      headers: {
        "Content-Type": descarga.tipo,
        "Content-Disposition": `${archivo === "pdf" ? "inline" : "attachment"}; filename="${descarga.nombre}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
