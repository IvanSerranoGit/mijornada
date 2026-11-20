import { loginInspector } from "@mijornada/api";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../lib/supabase/admin.ts";
import { SITE_URL } from "../../../lib/supabase/env.ts";
import { createSupabaseServer } from "../../../lib/supabase/server.ts";

// Enlace temporal de inspector: si sigue vigente, abre la sesión del inspector de ese
// reporte en este navegador y lo lleva a la página del reporte.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const concedido = /^[0-9a-f]{48}$/.test(token)
    ? await loginInspector(createSupabaseAdmin(), token).catch(() => null)
    : null;
  if (concedido !== null) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: concedido.tokenHash,
      type: "email",
    });
    if (!error) return NextResponse.redirect(`${SITE_URL}/inspector`);
  }
  return NextResponse.redirect(`${SITE_URL}/inspector?vencido=1`);
}
