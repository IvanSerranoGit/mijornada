import { handleKioscoRequest } from "@mijornada/api";
import { createSupabaseAdmin, createSupabasePublic } from "../../../../../lib/supabase.ts";

// La API del kiosco se define en packages/api; aquí solo se monta.
async function handle(
  request: Request,
  { params }: { params: Promise<{ ruta: string[] }> },
): Promise<Response> {
  const { ruta } = await params;
  return handleKioscoRequest(request, ruta, {
    publico: createSupabasePublic(),
    admin: createSupabaseAdmin,
    // Los enlaces del aviso de privacidad apuntan a la app web, no al kiosco.
    origin: (process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://mijornada.xyz").replace(/\/$/, ""),
  });
}

export { handle as GET, handle as POST, handle as PUT };
