"use client";

import { cx } from "@mijornada/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { href: "/panel", titulo: "Inicio" },
  { href: "/panel/incidencias", titulo: "Incidencias" },
  { href: "/panel/documentos", titulo: "Documentos" },
  { href: "/panel/reportes", titulo: "Reportes" },
  { href: "/panel/equipo", titulo: "Equipo" },
  { href: "/panel/plan", titulo: "Plan" },
] as const;

/** Secciones del panel del patrón. */
export function Navegacion() {
  const actual = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="-mx-(--espacio-xs) flex gap-(--espacio-2xs) overflow-x-auto"
    >
      {SECCIONES.map((seccion) => {
        const activa =
          seccion.href === "/panel" ? actual === "/panel" : actual.startsWith(seccion.href);
        return (
          <Link
            key={seccion.href}
            href={seccion.href}
            aria-current={activa ? "page" : undefined}
            className={cx(
              "rounded-(--radio-md) px-(--espacio-sm) py-(--espacio-xs) text-pequeno font-medium whitespace-nowrap",
              activa
                ? "bg-bg-brand-soft text-text-brand"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {seccion.titulo}
          </Link>
        );
      })}
    </nav>
  );
}
