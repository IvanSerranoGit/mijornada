import type { Metadata } from "next";
import { PaginaLegal } from "../../lib/legal.tsx";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Términos de servicio · Mi Jornada",
  alternates: { canonical: "/terminos" },
};

export default function Page() {
  return <PaginaLegal archivo="terminos-servicio-mijornada-v0.9.md" />;
}
