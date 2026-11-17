import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.ts";

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Primario: una sola acción principal por pantalla. Secundario: apoyo. Fantasma: terciaria. */
  estilo?: "primario" | "secundario" | "fantasma";
  /** L para marcaje en PWA y kiosco; M para paneles. */
  tamano?: "m" | "l";
}

const ESTILOS = {
  primario: "bg-bg-brand text-text-on-brand hover:bg-bg-brand-hover",
  secundario:
    "bg-bg-surface text-text-brand border-[1.5px] border-border-brand hover:bg-bg-brand-soft",
  fantasma: "text-text-brand hover:bg-bg-brand-soft",
} as const;

const TAMANOS = {
  m: "px-(--espacio-md) py-[12px] text-pequeno",
  l: "px-(--espacio-lg) py-[18px] text-cuerpo",
} as const;

export function Boton({
  estilo = "primario",
  tamano = "m",
  type = "button",
  className,
  ...props
}: BotonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center rounded-(--radio-md) font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-brand",
        "disabled:cursor-not-allowed disabled:opacity-60",
        ESTILOS[estilo],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    />
  );
}
