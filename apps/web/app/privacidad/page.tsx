import type { Metadata } from "next";
import { PaginaLegal } from "../../lib/legal.tsx";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Aviso de privacidad · Mi Jornada",
  alternates: { canonical: "/privacidad" },
};

export default function Page() {
  return <PaginaLegal archivo="aviso-privacidad-mijornada-v0.9.md" />;
}
