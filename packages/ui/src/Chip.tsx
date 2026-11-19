import type { ReactNode } from "react";
import { cx } from "./cx.ts";

export interface ChipProps {
  /** Bien: dentro de topes. Alerta: acercándose al tope. Crítico: tope superado. Neutro: informativo. */
  tono?: "bien" | "alerta" | "critico" | "neutro";
  children: ReactNode;
  className?: string;
}

const TONOS = {
  bien: "bg-status-good-soft text-status-good",
  alerta: "bg-status-warning-soft text-status-warning-text",
  critico: "bg-status-critical-soft text-status-critical",
  neutro: "bg-bg-subtle text-text-secondary",
} as const;

export function Chip({ tono = "bien", children, className }: ChipProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-(--espacio-xs) rounded-(--radio-full) px-(--espacio-sm) py-[6px] text-pequeno font-medium whitespace-nowrap",
        TONOS[tono],
        className,
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
