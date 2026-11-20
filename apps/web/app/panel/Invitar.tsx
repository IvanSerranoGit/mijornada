"use client";

import { Boton } from "@mijornada/ui";
import { useState, useTransition } from "react";
import { enviarInvitacion, invitar } from "../app/actions.ts";

/** Genera el enlace personal para que la persona marque desde su celular y lo copia. */
export function Invitar({ trabajadorId }: { trabajadorId: string }) {
  const [enlace, setEnlace] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [generando, start] = useTransition();

  return (
    <div className="flex flex-col gap-(--espacio-2xs)">
      <Boton
        estilo="fantasma"
        className="self-start px-0"
        disabled={generando}
        onClick={() => {
          start(async () => {
            const resultado = await invitar(trabajadorId);
            if (resultado.enlace) {
              setEnlace(resultado.enlace);
              const copiado = await navigator.clipboard.writeText(resultado.enlace).then(
                () => true,
                () => false,
              );
              setMensaje(
                copiado
                  ? "Enlace copiado. Envíaselo por WhatsApp o correo; vence en 7 días."
                  : "Copia el enlace y envíaselo; vence en 7 días.",
              );
            } else {
              setMensaje(resultado.error ?? "No se pudo generar el enlace.");
            }
          });
        }}
      >
        {generando ? "Generando…" : "Invitar a marcar desde su celular"}
      </Boton>
      {enlace ? (
        <p className="text-nota break-all text-text-secondary select-all">{enlace}</p>
      ) : null}
      {mensaje ? <p className="text-nota text-text-secondary">{mensaje}</p> : null}
      {enlace ? (
        <form
          className="flex flex-wrap items-center gap-(--espacio-xs)"
          action={(formData) => {
            const correo = formData.get("correo");
            if (typeof correo !== "string") return;
            start(async () => {
              const resultado = await enviarInvitacion(trabajadorId, enlace, correo);
              setMensaje(resultado.ok ?? resultado.error ?? null);
            });
          }}
        >
          <input
            type="email"
            name="correo"
            required
            placeholder="o envíaselo a su correo"
            aria-label="Correo de la persona"
            className="rounded-(--radio-md) border border-border-default bg-bg-surface px-(--espacio-sm) py-(--espacio-xs) text-pequeno"
          />
          <Boton type="submit" estilo="fantasma" disabled={generando}>
            Enviar
          </Boton>
        </form>
      ) : null}
    </div>
  );
}
