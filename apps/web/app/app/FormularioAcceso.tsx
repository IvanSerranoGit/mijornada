"use client";

import { Boton, Campo } from "@mijornada/ui";
import { useActionState } from "react";
import { activarAcceso, entrarConPin } from "./actions.ts";

/** Correo + PIN. Con `token` activa una invitación; sin él, entra a una cuenta ya activada. */
export function FormularioAcceso({ token }: { token?: string }) {
  const [estado, accion, enviando] = useActionState(token ? activarAcceso : entrarConPin, {});

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <Campo
        etiqueta="Tu correo"
        name="correo"
        type="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        nota={token ? "Con este correo vas a entrar las próximas veces." : undefined}
        required
      />
      <Campo
        etiqueta="Tu PIN de 4 dígitos"
        name="pin"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="off"
        placeholder="••••"
        nota="Es el PIN que te dio tu patrón."
        required
      />
      {estado.error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {estado.error}
        </p>
      ) : null}
      <Boton type="submit" tamano="l" disabled={enviando}>
        {token ? "Activar mi acceso" : "Entrar"}
      </Boton>
    </form>
  );
}
