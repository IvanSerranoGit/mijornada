function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example y completa las llaves.`,
    );
  }
  return value;
}

// Next solo inyecta las variables NEXT_PUBLIC_* si se leen con su nombre literal.
export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env["NEXT_PUBLIC_SUPABASE_URL"],
);
export const SUPABASE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
);
export const SITE_URL = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
// Entrada con Google: fuera del piloto. El botón solo aparece con NEXT_PUBLIC_AUTH_GOOGLE=true.
export const GOOGLE_AUTH_ENABLED = process.env["NEXT_PUBLIC_AUTH_GOOGLE"] === "true";
