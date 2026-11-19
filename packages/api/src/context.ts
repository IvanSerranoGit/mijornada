import type { Database } from "@mijornada/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { Database };

/** Cliente de Supabase con la sesión de quien llama: RLS decide qué puede ver y hacer. */
export type Db = SupabaseClient<Database>;

/** Claims que agrega tenants.claims_token_acceso al JWT. */
export interface Sesion {
  authUserId: string;
  tenantId: string | null;
  rol: string | null;
  usuarioId: string | null;
  centroId: string | null;
  trabajadorId: string | null;
}

export interface Ctx {
  db: Db;
  sesion: Sesion;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** Arma la sesión a partir de los claims verificados del JWT. */
export function sesionFromClaims(claims: Record<string, unknown>): Sesion | null {
  const authUserId = text(claims["sub"]);
  if (authUserId === null) {
    return null;
  }
  return {
    authUserId,
    tenantId: text(claims["tenant_id"]),
    rol: text(claims["rol"]),
    usuarioId: text(claims["usuario_id"]),
    centroId: text(claims["centro_id"]),
    trabajadorId: text(claims["trabajador_id"]),
  };
}
