import { cx } from "./cx.ts";

export interface LogoProps {
  /** Horizontal: uso principal. Apilado: espacios cuadrados. Símbolo: favicon, ícono de app, kiosco. */
  tipo?: "horizontal" | "apilado" | "simbolo";
  /** Color sobre fondos claros; negro para una tinta; blanco sobre fondo de marca o inverso. */
  color?: "color" | "negro" | "blanco";
  /** Lado del símbolo en px. Mínimo: 24 en app, 16 en favicon; horizontal completo, 120 de ancho. */
  tamano?: number;
  className?: string;
}

const TINTAS = {
  color: { trazo: "#0F766E", punto: "#A3E635", texto: "#111827" },
  negro: { trazo: "#111827", punto: "#111827", texto: "#111827" },
  blanco: { trazo: "#FFFFFF", punto: "#FFFFFF", texto: "#FFFFFF" },
} as const;

/** Símbolo de 48 px que acompaña al nombre (variantes horizontal y apilada). */
function SimboloConNombre({ trazo, punto, size }: { trazo: string; punto: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M37.5 6H28.5V31.5H37.5V6Z" fill={trazo} />
      <path
        d="M37.5 30V33C37.5 37.9703 33.4702 42 28.5 42H18C13.0297 42 9 37.9703 9 33V30"
        strokeWidth="12"
        stroke={trazo}
      />
      <path d="M16.5 6H7.5V15H16.5V6Z" fill={punto} />
    </svg>
  );
}

/** Símbolo solo, dibujado a 64 px. */
function SimboloSolo({ trazo, punto, size }: { trazo: string; punto: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Mi Jornada"
    >
      <path d="M50 8H38V42H50V8Z" fill={trazo} />
      <path
        d="M50 40V44C50 50.627 44.627 56 38 56H24C17.373 56 12 50.627 12 44V40"
        strokeWidth="12"
        stroke={trazo}
      />
      <path d="M22 8H10V20H22V8Z" fill={punto} />
    </svg>
  );
}

export function Logo({ tipo = "horizontal", color = "color", tamano, className }: LogoProps) {
  const tinta = TINTAS[color];

  if (tipo === "simbolo") {
    return (
      <span className={cx("inline-flex", className)}>
        <SimboloSolo trazo={tinta.trazo} punto={tinta.punto} size={tamano ?? 64} />
      </span>
    );
  }

  const size = tamano ?? 48;
  // En Figma el nombre mide 34 px (horizontal) o 28 px (apilado) junto a un símbolo de 48 px.
  const fontSize = (size * (tipo === "horizontal" ? 34 : 28)) / 48;

  return (
    <span
      role="img"
      aria-label="Mi Jornada"
      className={cx("inline-flex items-center", tipo === "apilado" && "flex-col", className)}
      style={{ gap: (size * (tipo === "horizontal" ? 14 : 12)) / 48 }}
    >
      <SimboloConNombre trazo={tinta.trazo} punto={tinta.punto} size={size} />
      <span
        aria-hidden="true"
        className="font-titulo font-bold whitespace-nowrap"
        style={{ fontSize, lineHeight: 1.25, letterSpacing: "-0.02em", color: tinta.texto }}
      >
        mi jornada
      </span>
    </span>
  );
}
