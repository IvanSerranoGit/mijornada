import { Logo, Tarjeta } from "@mijornada/ui";
import type { ReactNode } from "react";

export default function CuentaLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-xl) p-(--espacio-lg)">
      <Logo tamano={40} />
      <Tarjeta className="w-full max-w-md">{children}</Tarjeta>
    </main>
  );
}
