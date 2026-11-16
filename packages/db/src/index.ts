import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/** URL del Postgres local que levanta `supabase start`. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function resolveDatabaseUrl(): string {
  return process.env["DATABASE_URL"] ?? LOCAL_DATABASE_URL;
}

/** Crea un cliente de Drizzle. Solo para código de servidor. */
export function createDb(url: string = resolveDatabaseUrl()) {
  const client = postgres(url, { prepare: false });
  return { db: drizzle(client), client };
}
