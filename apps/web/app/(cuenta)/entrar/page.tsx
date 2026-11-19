import type { Metadata } from "next";
import { GOOGLE_AUTH_ENABLED } from "../../../lib/supabase/env.ts";
import { FormularioCuenta } from "../FormularioCuenta.tsx";

export const metadata: Metadata = { title: "Entra a tu cuenta · Mi Jornada" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  return (
    <div className="flex flex-col gap-(--espacio-lg)">
      <header className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-2 font-bold">Entra a tu cuenta</h1>
        <p className="text-text-secondary">Registra y consulta la jornada de tu equipo.</p>
      </header>
      <FormularioCuenta modo="entrar" siguiente={siguiente} google={GOOGLE_AUTH_ENABLED} />
    </div>
  );
}
