"use client";

import type { Database } from "@mijornada/api";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./env.ts";

/** Cliente de Supabase para el navegador (comparte la sesión por cookies con el servidor). */
export function createSupabaseBrowser() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}
