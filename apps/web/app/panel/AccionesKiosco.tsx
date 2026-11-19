"use client";

import { Boton } from "@mijornada/ui";
import { useState, useTransition } from "react";
import { nuevoCodigoEnlace, nuevoPinAdmin, type Secreto } from "./actions.ts";

interface Mostrado {
  titulo: string;
  nota: string;
  secreto: Secreto;
}

/** Acciones del kiosco de un centro: vincular otra tablet y regenerar el PIN de administrador. */
export function AccionesKiosco({ centroId }: { centroId: string }) {
  const [mostrado, setMostrado] = useState<Mostrado | null>(null);
  const [ocupado, start] = useTransition();

  return (
    <div className="flex flex-col gap-(--espacio-xs) py-(--espacio-sm)">
      <div className="flex flex-wrap gap-(--espacio-xs)">
        <Boton
          estilo="secundario"
          disabled={ocupado}
          onClick={() => {
            start(async () => {
              setMostrado({
                titulo: "Código para vincular un kiosco",
                nota: "Es de un solo uso y vence en 7 días. Tecléalo en la tablet.",
                secreto: await nuevoCodigoEnlace(centroId),
              });
            });
          }}
        >
          Vincular un kiosco
        </Boton>
        <Boton
          estilo="fantasma"
          disabled={ocupado}
          onClick={() => {
            start(async () => {
              setMostrado({
                titulo: "PIN de administrador del kiosco",
                nota: "Sirve para desvincular una tablet. Anótalo: no se vuelve a mostrar y reemplaza al anterior.",
                secreto: await nuevoPinAdmin(centroId),
              });
            });
          }}
        >
          Nuevo PIN de administrador
        </Boton>
      </div>
      {mostrado ? (
        <div role="status" className="rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md)">
          {mostrado.secreto.valor ? (
            <>
              <p className="text-etiqueta font-medium text-text-secondary uppercase">
                {mostrado.titulo}
              </p>
              <p className="font-titulo text-titulo-1 font-bold tracking-widest">
                {mostrado.secreto.valor}
              </p>
              <p className="text-nota text-text-secondary">{mostrado.nota}</p>
            </>
          ) : (
            <p className="text-pequeno text-status-critical">
              {mostrado.secreto.error ?? "No se pudo generar."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
