import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./cx.ts";

export interface SelectorProps extends SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta: string;
  error?: string | undefined;
  nota?: string | undefined;
  children: ReactNode;
}

/** Lista desplegable con el mismo aspecto que Campo. */
export function Selector({
  etiqueta,
  error,
  nota,
  id,
  className,
  disabled,
  children,
  ...props
}: SelectorProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helpId = `${selectId}-ayuda`;
  const help = error ?? nota;

  return (
    <div className={cx("flex flex-col gap-(--espacio-xs)", disabled && "opacity-60", className)}>
      <label htmlFor={selectId} className="text-pequeno font-medium text-text-primary">
        {etiqueta}
      </label>
      <select
        id={selectId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={help ? helpId : undefined}
        className={cx(
          "w-full appearance-none rounded-(--radio-md) border bg-bg-surface px-(--espacio-md) py-[12px] text-cuerpo text-text-primary outline-none",
          "disabled:cursor-not-allowed disabled:bg-bg-subtle",
          error
            ? "border-status-critical focus:ring-1 focus:ring-status-critical"
            : "border-border-default focus:border-border-brand focus:ring-1 focus:ring-border-brand",
        )}
        {...props}
      >
        {children}
      </select>
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
