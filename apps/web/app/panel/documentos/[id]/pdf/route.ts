import { ApiError, errorResponse, getDocumentoImprimible, getLogoDataUrl } from "@mijornada/api";
import { z } from "zod";
import { htmlToPdf } from "../../../../../lib/pdf.ts";
import { SITE_URL } from "../../../../../lib/supabase/env.ts";
import { getCtx } from "../../../../../lib/supabase/server.ts";

export const maxDuration = 60;

// PDF de una versión de documento para imprimir y firmar. Con ?trabajador=<id> lleva
// los datos de esa persona; sin él, líneas en blanco. Lo ve quien puede ver el documento.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCtx();
    if (ctx === null) throw new ApiError(401, "no_autenticado", "Inicia sesión para continuar.");
    const id = z.uuid().parse((await params).id);
    const trabajador = new URL(request.url).searchParams.get("trabajador");
    const documento = await getDocumentoImprimible(
      ctx,
      id,
      SITE_URL,
      trabajador === null ? undefined : z.uuid().parse(trabajador),
    );

    const logo = await getLogoDataUrl(ctx, documento.tenant_id);
    const pdf = await htmlToPdf({
      ...(logo === null ? {} : { logo }),
      titulo: `${documento.titulo} · ${documento.razon_social}`,
      cuerpoHtml: `${documento.contenido_html}
<div class="firmas"><div>Por la Empresa<br>Nombre y firma</div><div>La Persona Trabajadora<br>Nombre y firma</div></div>`,
      pie: `Versión ${String(documento.version)} · SHA-256 ${documento.contenido_hash}`,
    });
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${documento.titulo.toLowerCase().replace(/[^a-z]+/g, "-")}-v${String(documento.version)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
