"use client";

import { Boton } from "@mijornada/ui";
import { useActionState } from "react";
import { resolver } from "./actions.ts";

/** Botones para aprobar o rechazar una incidencia pendiente. */
export function Resolver({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(resolver, {});
  return (
    <form action={accion} className="flex flex-wrap items-center gap-(--espacio-xs)">
      <input type="hidden" name="id" value={id} />
      <Boton type="submit" name="decision" value="aprobar" disabled={enviando}>
        Aprobar
      </Boton>
      <Boton type="submit" name="decision" value="rechazar" estilo="fantasma" disabled={enviando}>
        Rechazar
      </Boton>
      {estado.error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}
