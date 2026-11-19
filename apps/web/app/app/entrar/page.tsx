import { Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { FormularioAcceso } from "../FormularioAcceso.tsx";

export const metadata: Metadata = { title: "Entrar · Mi Jornada" };

export default function EntrarPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-xl) p-(--espacio-lg)">
      <Logo tamano={40} />
      <Tarjeta className="flex w-full max-w-md flex-col gap-(--espacio-lg)">
        <header className="flex flex-col gap-(--espacio-2xs)">
          <h1 className="font-titulo text-titulo-2 font-bold">Registra tu jornada</h1>
          <p className="text-text-secondary">
            Entra con el correo con el que activaste tu acceso y tu PIN.
          </p>
        </header>
        <FormularioAcceso />
      </Tarjeta>
    </main>
  );
}
