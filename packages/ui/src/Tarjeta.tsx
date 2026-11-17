import type { HTMLAttributes } from "react";
import { cx } from "./cx.ts";

export interface TarjetaProps extends HTMLAttributes<HTMLDivElement> {
  /** Sobre fondo inverso (kiosco) la tarjeta no lleva borde. */
  borde?: boolean;
}

export function Tarjeta({ borde = true, className, ...props }: TarjetaProps) {
  return (
    <div
      className={cx(
        "rounded-(--radio-lg) bg-bg-surface p-(--espacio-lg) text-text-primary",
        borde && "border border-border-default",
        className,
      )}
      {...props}
    />
  );
}
