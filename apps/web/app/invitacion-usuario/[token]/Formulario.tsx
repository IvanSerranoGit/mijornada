"use client";

import { Boton, Campo } from "@mijornada/ui";
import { useActionState } from "react";
import { aceptar } from "./actions.ts";

export function Formulario({ token }: { token: string }) {
  const [estado, accion, enviando] = useActionState(aceptar, {});
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <input type="hidden" name="token" value={token} />
      <Campo
        etiqueta="Crea tu contraseña"
        name="contrasena"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        nota="Al menos 10 caracteres."
        error={estado.error}
      />
      <Boton type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar y entrar"}
      </Boton>
    </form>
  );
}
