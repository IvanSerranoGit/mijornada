import { getInvitacion } from "@mijornada/api";
import { Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabasePublic } from "../../../lib/supabase/admin.ts";
import { FormularioAcceso } from "../../app/FormularioAcceso.tsx";

export const metadata: Metadata = {
  title: "Activa tu acceso · Mi Jornada",
  robots: { index: false },
};

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitacion = await getInvitacion(createSupabasePublic(), token).catch(() => null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-xl) p-(--espacio-lg)">
      <Logo tamano={40} />
      <Tarjeta className="flex w-full max-w-md flex-col gap-(--espacio-lg)">
        {invitacion ? (
          <>
            <header className="flex flex-col gap-(--espacio-2xs)">
              <h1 className="font-titulo text-titulo-2 font-bold">Hola, {invitacion.nombre}</h1>
              <p className="text-text-secondary">
                {invitacion.empresa} te invita a registrar tu entrada y salida desde tu celular.
              </p>
            </header>
            <FormularioAcceso token={token} />
          </>
        ) : (
          <>
            <h1 className="font-titulo text-titulo-2 font-bold">Este enlace ya no sirve</h1>
            <p className="text-text-secondary">
              La invitación ya se usó o venció. Pide a tu patrón que te envíe una nueva; si ya
              activaste tu acceso,{" "}
              <Link href="/app/entrar" className="font-medium text-text-brand">
                entra con tu correo y tu PIN
              </Link>
              .
            </p>
          </>
        )}
      </Tarjeta>
    </main>
  );
}
