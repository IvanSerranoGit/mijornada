import { buildOpenApi, handleRequest } from "@mijornada/api";
import { getRequestCtx } from "../../../../lib/supabase/server.ts";

// Toda la API /api/v1 se define en packages/api; aquí solo se monta.
async function handle(
  request: Request,
  { params }: { params: Promise<{ ruta: string[] }> },
): Promise<Response> {
  const { ruta } = await params;
  if (request.method === "GET" && ruta.length === 1 && ruta[0] === "openapi.json") {
    return Response.json(buildOpenApi());
  }
  return handleRequest(request, ruta, { getCtx: () => getRequestCtx(request) });
}

export { handle as GET, handle as PATCH, handle as POST };
