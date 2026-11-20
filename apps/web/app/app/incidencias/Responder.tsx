"use client";

import { Boton, Campo } from "@mijornada/ui";
import { useActionState } from "react";
import { responder } from "./actions.ts";

/** El trabajador responde a una incidencia que abrió su empresa. */
export function Responder({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(responder, {});
  if (estado.ok) {
    return (
      <p role="status" className="text-pequeno text-text-brand">
        {estado.ok}
      </p>
    );
  }
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-sm)">
      <input type="hidden" name="id" value={id} />
      <Campo
        etiqueta="Comentario (obligatorio si no estás de acuerdo)"
        name="comentario"
        maxLength={500}
        error={estado.error}
      />
      <div className="flex flex-wrap gap-(--espacio-xs)">
        <Boton type="submit" name="respuesta" value="conforme" disabled={enviando}>
          Estoy de acuerdo
        </Boton>
        <Boton
          type="submit"
          name="respuesta"
          value="inconforme"
          estilo="secundario"
          disabled={enviando}
        >
          No estoy de acuerdo
        </Boton>
      </div>
    </form>
  );
}
