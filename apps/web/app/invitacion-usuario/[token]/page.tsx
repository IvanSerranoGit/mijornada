import { getInvitacionUsuario, ROLES } from "@mijornada/api";
import { Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { createSupabaseAdmin } from "../../../lib/supabase/admin.ts";
import { Formulario } from "./Formulario.tsx";

export const metadata: Metadata = {
  title: "Activa tu acceso · Mi Jornada",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

// Enlace que recibe por correo un administrador o supervisor invitado: fija su contraseña.
export default async function InvitacionUsuarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitacion = await getInvitacionUsuario(createSupabaseAdmin(), token).catch(() => null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-xl) p-(--espacio-lg)">
      <Logo tamano={40} />
      <Tarjeta className="flex w-full max-w-md flex-col gap-(--espacio-lg)">
        {invitacion ? (
          <>
            <header className="flex flex-col gap-(--espacio-2xs)">
              <h1 className="font-titulo text-titulo-2 font-bold">Activa tu acceso</h1>
              <p className="text-text-secondary">
                {invitacion.empresa} te invitó como{" "}
                {(ROLES[invitacion.rol] ?? invitacion.rol).toLowerCase()}. Entrarás con{" "}
                {invitacion.correo}.
              </p>
            </header>
            <Formulario token={token} />
          </>
        ) : (
          <>
            <h1 className="font-titulo text-titulo-2 font-bold">Este enlace ya no sirve</h1>
            <p className="text-text-secondary">
              La invitación ya se usó o venció. Pide a quien te invitó que te envíe una nueva.
            </p>
          </>
        )}
      </Tarjeta>
    </main>
  );
}
