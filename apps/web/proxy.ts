import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./lib/supabase/env.ts";

const PROTEGIDAS = ["/onboarding", "/panel", "/app"];

// Refresca la sesión de Supabase en cada petición y manda a iniciar sesión a
// quien entra sin ella a una ruta protegida. Los permisos reales los aplica RLS.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname } = request.nextUrl;

  if (
    !data &&
    pathname !== "/app/entrar" &&
    PROTEGIDAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
  ) {
    const url = request.nextUrl.clone();
    // El trabajador entra con correo + PIN; el patrón, con su cuenta.
    const esPwa = pathname === "/app" || pathname.startsWith("/app/");
    url.pathname = esPwa ? "/app/entrar" : "/entrar";
    url.search = esPwa ? "" : `?siguiente=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|svg|jpg|ico)$).*)",
  ],
};
