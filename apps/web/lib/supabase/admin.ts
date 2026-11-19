import "server-only";
import type { Database, Db } from "@mijornada/api";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env.ts";

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente con rol de servicio. Solo en el servidor: abre sesiones de trabajadores y guarda fotos. */
export function createSupabaseAdmin(): Db {
  const key = process.env["SUPABASE_SECRET_KEY"];
  if (!key) throw new Error("Falta la variable de entorno SUPABASE_SECRET_KEY.");
  return createClient<Database>(SUPABASE_URL, key, options);
}

/** Cliente sin sesión (llave pública). */
export function createSupabasePublic(): Db {
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, options);
}
