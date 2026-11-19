import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx.ts";

export interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  /** Texto de ayuda en estado de error; su presencia pone el campo en error. */
  error?: string | undefined;
  /** Nota bajo el campo cuando no hay error. */
  nota?: string | undefined;
}

export function Campo({ etiqueta, error, nota, id, className, disabled, ...props }: CampoProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-ayuda`;
  const help = error ?? nota;

  return (
    <div className={cx("flex flex-col gap-(--espacio-xs)", disabled && "opacity-60", className)}>
      <label htmlFor={inputId} className="text-pequeno font-medium text-text-primary">
        {etiqueta}
      </label>
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={help ? helpId : undefined}
        className={cx(
          "w-full rounded-(--radio-md) border px-(--espacio-md) py-[12px] text-cuerpo text-text-primary outline-none placeholder:text-text-secondary",
          "disabled:cursor-not-allowed disabled:bg-bg-subtle",
          // Enfocado: borde de marca a 2 px (1 px de borde + 1 px de anillo, sin mover el contenido).
          error
            ? "border-status-critical bg-bg-surface focus:ring-1 focus:ring-status-critical"
            : "border-border-default bg-bg-surface focus:border-border-brand focus:ring-1 focus:ring-border-brand",
        )}
        {...props}
      />
      {help ? (
        <p
          id={helpId}
          className={cx("text-nota", error ? "text-status-critical" : "text-text-secondary")}
        >
          {help}
        </p>
      ) : null}
    </div>
  );
}
