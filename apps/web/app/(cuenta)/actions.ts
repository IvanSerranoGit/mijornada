"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SITE_URL } from "../../lib/supabase/env.ts";
import { createSupabaseServer } from "../../lib/supabase/server.ts";

export interface AuthState {
  error?: string;
  aviso?: string;
}

const credenciales = z.object({
  correo: z.email("Escribe un correo válido."),
  contrasena: z.string().min(8, "La contraseña necesita al menos 8 caracteres."),
});

/** Solo se aceptan destinos internos para no redirigir a otro sitio. */
function destino(formData: FormData, fallback: string): string {
  const siguiente = formData.get("siguiente");
  return typeof siguiente === "string" && siguiente.startsWith("/") && !siguiente.startsWith("//")
    ? siguiente
    : fallback;
}

const MENSAJES: Record<string, string> = {
  invalid_credentials: "El correo o la contraseña no coinciden.",
  user_already_exists: "Ya hay una cuenta con ese correo. Inicia sesión.",
  email_not_confirmed: "Confirma tu correo con el enlace que te enviamos.",
  weak_password: "Elige una contraseña más larga o menos común.",
  over_email_send_rate_limit: "Ya enviamos un correo hace poco. Espera un minuto.",
};

const mensaje = (code: string | undefined) =>
  (code ? MENSAJES[code] : undefined) ?? "No se pudo completar. Intenta de nuevo.";

export async function registrar(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credenciales.safeParse({
    correo: formData.get("correo"),
    contrasena: formData.get("contrasena"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.correo,
    password: parsed.data.contrasena,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?siguiente=/onboarding` },
  });
  if (error) return { error: mensaje(error.code) };
  if (!data.session) return { aviso: "Te enviamos un correo para confirmar tu cuenta." };
  redirect("/onboarding");
}

export async function entrar(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credenciales.safeParse({
    correo: formData.get("correo"),
    contrasena: formData.get("contrasena"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.correo,
    password: parsed.data.contrasena,
  });
  if (error) return { error: mensaje(error.code) };
  redirect(destino(formData, "/panel"));
}

export async function enviarEnlace(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const correo = z.email("Escribe un correo válido.").safeParse(formData.get("correo"));
  if (!correo.success) return { error: correo.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: correo.data,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?siguiente=${encodeURIComponent(destino(formData, "/panel"))}`,
    },
  });
  if (error) return { error: mensaje(error.code) };
  return { aviso: "Te enviamos un enlace para entrar. Revisa tu correo." };
}

export async function entrarConGoogle(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/auth/callback?siguiente=${encodeURIComponent(destino(formData, "/panel"))}`,
    },
  });
  if (error || !data.url) redirect("/entrar?error=google");
  redirect(data.url);
}

export async function salir(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/entrar");
}
