import { Boton, Logo } from "@mijornada/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { salir } from "../(cuenta)/actions.ts";
import { Navegacion } from "./Navegacion.tsx";

// Marco común del panel del patrón: marca, secciones y salida. Cada página valida su sesión.
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex flex-col gap-(--espacio-sm)">
        <div className="flex items-center justify-between">
          <Link href="/panel" aria-label="Mi Jornada, inicio del panel">
            <Logo tamano={32} />
          </Link>
          <form action={salir}>
            <Boton type="submit" estilo="fantasma">
              Salir
            </Boton>
          </form>
        </div>
        <Navegacion />
      </header>
      {children}
    </main>
  );
}
