"use client";

import { Boton, Campo, Selector } from "@mijornada/ui";
import { useActionState, useState } from "react";
import { invitar } from "./actions.ts";

interface Props {
  centros: { id: string; nombre: string }[];
  /** Solo el dueño invita administradores. */
  puedeInvitarAdministradores: boolean;
}

/** Formulario para invitar a un administrador o a un supervisor por correo. */
export function InvitarUsuario({ centros, puedeInvitarAdministradores }: Props) {
  const [estado, accion, enviando] = useActionState(invitar, {});
  const [rol, setRol] = useState(puedeInvitarAdministradores ? "administrador" : "supervisor");
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" required autoComplete="off" />
        <Campo
          etiqueta="Correo"
          name="correo"
          type="email"
          required
          autoComplete="off"
          error={estado.error}
        />
      </div>
      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        <Selector
          etiqueta="Rol"
          name="rol"
          value={rol}
          onChange={(event) => {
            setRol(event.target.value);
          }}
        >
          {puedeInvitarAdministradores ? (
            <option value="administrador">Administrador: administra todo, menos el plan</option>
          ) : null}
          <option value="supervisor">Supervisor: ve y resuelve lo de su centro</option>
        </Selector>
        {rol === "supervisor" ? (
          <Selector
            etiqueta="Centro que supervisa"
            name="centro_id"
            required
            defaultValue={centros[0]?.id ?? ""}
          >
            {centros.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.nombre}
              </option>
            ))}
          </Selector>
        ) : null}
      </div>
      <div>
        <Boton type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar invitación"}
        </Boton>
      </div>
      {estado.ok ? (
        <div
          role="status"
          className="rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md) text-pequeno"
        >
          <p>{estado.ok}</p>
          {estado.enlace ? <p className="font-mono break-all">{estado.enlace}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
