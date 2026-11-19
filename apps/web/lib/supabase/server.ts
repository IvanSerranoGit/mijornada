import { sesionFromClaims, type Ctx, type Database, type Db } from "@mijornada/api";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./env.ts";

/** Cliente de Supabase con la sesión de las cookies de quien hace la petición. */
export async function createSupabaseServer(): Promise<Db> {
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy las refresca.
        }
      },
    },
  });
}

async function ctxFrom(db: Db, token?: string): Promise<Ctx | null> {
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data) return null;
  const sesion = sesionFromClaims(data.claims);
  return sesion === null ? null : { db, sesion };
}

/** Contexto de la API para quien tiene sesión por cookies (web y PWA); null si no hay. */
export async function getCtx(): Promise<Ctx | null> {
  return ctxFrom(await createSupabaseServer());
}

/** Contexto para una petición a la API: `Authorization: Bearer <jwt>` o, si no viene, cookies. */
export async function getRequestCtx(request: Request): Promise<Ctx | null> {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const db: Db = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return ctxFrom(db, token);
  }
  return getCtx();
}
