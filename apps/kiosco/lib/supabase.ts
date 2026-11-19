import "server-only";
import type { Database, Db } from "@mijornada/api";
import { createClient } from "@supabase/supabase-js";

const options = { auth: { persistSession: false, autoRefreshToken: false } };

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

/** Cliente sin sesión: el kiosco se identifica con su token de dispositivo. */
export function createSupabasePublic(): Db {
  return createClient<Database>(
    required("NEXT_PUBLIC_SUPABASE_URL", process.env["NEXT_PUBLIC_SUPABASE_URL"]),
    required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ),
    options,
  );
}

/** Cliente con rol de servicio: solo para guardar las fotos de marcaje. */
export function createSupabaseAdmin(): Db {
  return createClient<Database>(
    required("NEXT_PUBLIC_SUPABASE_URL", process.env["NEXT_PUBLIC_SUPABASE_URL"]),
    required("SUPABASE_SECRET_KEY", process.env["SUPABASE_SECRET_KEY"]),
    options,
  );
}
