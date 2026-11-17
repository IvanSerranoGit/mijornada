import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server.ts";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

// Llegada desde Google, desde un enlace mágico o desde la confirmación de correo.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const siguiente = searchParams.get("siguiente") ?? "/panel";
  const destino = siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/panel";
  const supabase = await createSupabaseServer();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const type = OTP_TYPES.find((t) => t === typeParam);

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Falta el código de acceso.") };

  return NextResponse.redirect(new URL(error ? "/entrar?error=enlace" : destino, origin));
}
