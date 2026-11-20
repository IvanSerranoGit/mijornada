"use client";

import { PLANES, PLANES_PAGADOS, type Ciclo } from "@mijornada/api";
import { Boton, Campo, Tarjeta, cx } from "@mijornada/ui";
import { useActionState, useState } from "react";
import { abrirPortal, contratar, guardarFacturacion } from "./actions.ts";

const pesos = (monto: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(monto);

/** Los tres planes con su precio mensual o anual (IVA incluido) y el botón para contratar. */
export function Planes({ personas, sugerido }: { personas: number; sugerido: string }) {
  const [estado, accion, enviando] = useActionState(contratar, {});
  const [ciclo, setCiclo] = useState<Ciclo>("mensual");
  return (
    <div className="flex flex-col gap-(--espacio-md)">
      <div role="group" aria-label="Forma de pago" className="flex gap-(--espacio-2xs)">
        {(["mensual", "anual"] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            aria-pressed={ciclo === valor}
            onClick={() => {
              setCiclo(valor);
            }}
            className={cx(
              "rounded-(--radio-md) px-(--espacio-md) py-(--espacio-xs) text-pequeno font-medium",
              ciclo === valor
                ? "bg-bg-brand text-text-on-brand"
                : "bg-bg-subtle text-text-secondary",
            )}
          >
            {valor === "mensual" ? "Mensual" : "Anual (2 meses gratis)"}
          </button>
        ))}
      </div>
      <ul className="grid gap-(--espacio-md) sm:grid-cols-3">
        {PLANES_PAGADOS.map((plan) => {
          const datos = PLANES[plan];
          return (
            <li key={plan}>
              <Tarjeta
                className={cx(
                  "flex h-full flex-col gap-(--espacio-sm)",
                  plan === sugerido && "ring-2 ring-border-brand",
                )}
              >
                <div>
                  <h3 className="font-titulo text-titulo-3 font-bold">{datos.nombre}</h3>
                  <p className="text-pequeno text-text-secondary">{datos.descripcion}</p>
                </div>
                <p>
                  <span className="font-titulo text-titulo-1 font-bold">{pesos(datos[ciclo])}</span>{" "}
                  <span className="text-pequeno text-text-secondary">
                    {ciclo === "mensual" ? "al mes" : "al año"}, IVA incluido
                  </span>
                </p>
                {plan === sugerido ? (
                  <p className="text-nota text-text-brand">
                    El que te corresponde hoy: tienes {personas}{" "}
                    {personas === 1 ? "persona" : "personas"}.
                  </p>
                ) : null}
                <form action={accion} className="mt-auto">
                  <input type="hidden" name="plan" value={plan} />
                  <input type="hidden" name="ciclo" value={ciclo} />
                  <Boton
                    type="submit"
                    estilo={plan === sugerido ? "primario" : "secundario"}
                    disabled={enviando}
                  >
                    Elegir {datos.nombre}
                  </Boton>
                </form>
              </Tarjeta>
            </li>
          );
        })}
      </ul>
      {estado.error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {estado.error}
        </p>
      ) : null}
    </div>
  );
}

export function Portal() {
  const [estado, accion, enviando] = useActionState(abrirPortal, {});
  return (
    <form action={accion} className="flex flex-wrap items-center gap-(--espacio-sm)">
      <Boton type="submit" estilo="secundario" disabled={enviando}>
        Administrar plan y forma de pago
      </Boton>
      {estado.error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}

export interface DatosFiscales {
  rfc: string | null;
  regimen_fiscal: string | null;
  cp_fiscal: string | null;
  uso_cfdi: string | null;
}

/** Datos para la factura, que por ahora se emite a mano. */
export function Facturacion({ datos }: { datos: DatosFiscales }) {
  const [estado, accion, enviando] = useActionState(guardarFacturacion, {});
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        <Campo
          etiqueta="RFC"
          name="rfc"
          defaultValue={datos.rfc ?? ""}
          autoCapitalize="characters"
        />
        <Campo
          etiqueta="Código postal fiscal"
          name="cp_fiscal"
          inputMode="numeric"
          defaultValue={datos.cp_fiscal ?? ""}
        />
        <Campo
          etiqueta="Régimen fiscal"
          name="regimen_fiscal"
          defaultValue={datos.regimen_fiscal ?? ""}
          nota="Por ejemplo: 626 Régimen Simplificado de Confianza."
        />
        <Campo
          etiqueta="Uso de CFDI"
          name="uso_cfdi"
          defaultValue={datos.uso_cfdi ?? ""}
          nota="Por ejemplo: G03 Gastos en general."
          error={estado.error}
        />
      </div>
      <div className="flex flex-wrap items-center gap-(--espacio-sm)">
        <Boton type="submit" estilo="secundario" disabled={enviando}>
          Guardar datos de facturación
        </Boton>
        {estado.ok ? (
          <p role="status" className="text-pequeno text-text-brand">
            {estado.ok}
          </p>
        ) : null}
      </div>
    </form>
  );
}
