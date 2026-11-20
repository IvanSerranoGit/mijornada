"use client";

import type { DocumentoParaAceptar } from "@mijornada/api";
import { Boton, Campo } from "@mijornada/ui";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { aceptarDocumentos } from "./actions.ts";

interface Props {
  nombre: string;
  pendientes: DocumentoParaAceptar[];
}

/**
 * Aceptación con firma simple: la persona lee el aviso simplificado y el convenio completo
 * (hay que llegar al final) y teclea su nombre completo.
 */
export function Consentimiento({ nombre, pendientes }: Props) {
  const [estado, accion, enviando] = useActionState(aceptarDocumentos, {});
  const aviso = pendientes.find((d) => d.tipo === "aviso_privacidad");
  const convenio = pendientes.find((d) => d.tipo === "convenio_registro");
  const [leido, setLeido] = useState(convenio === undefined);
  const fin = useRef<HTMLDivElement>(null);

  // El convenio se da por leído cuando el final entra a la vista dentro de su recuadro.
  useEffect(() => {
    const marca = fin.current;
    if (!marca) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLeido(true);
      },
      { root: marca.parentElement, threshold: 1 },
    );
    observer.observe(marca);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-lg)">
      {aviso ? (
        <section className="flex flex-col gap-(--espacio-sm)">
          <h2 className="font-titulo text-titulo-3 font-bold">Aviso de privacidad</h2>
          <div
            className="documento rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md)"
            dangerouslySetInnerHTML={{ __html: aviso.resumen_html ?? aviso.contenido_html }}
          />
        </section>
      ) : null}

      {convenio ? (
        <section className="flex flex-col gap-(--espacio-sm)">
          <h2 className="font-titulo text-titulo-3 font-bold">Convenio de registro de jornada</h2>
          <p className="text-pequeno text-text-secondary">
            Léelo completo; desliza hasta el final.
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Texto del convenio"
            className="max-h-[50vh] overflow-y-auto rounded-(--radio-md) border border-border-default bg-bg-surface p-(--espacio-md)"
          >
            <div
              className="documento"
              dangerouslySetInnerHTML={{ __html: convenio.contenido_html }}
            />
            <div ref={fin} data-testid="fin-del-convenio" className="h-px" />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-(--espacio-sm)">
        <Campo
          etiqueta="Para aceptar, escribe tu nombre completo"
          name="nombre"
          autoComplete="name"
          required
          disabled={!leido}
          nota={
            leido
              ? `Como aparece en tu registro: ${nombre}`
              : "Primero lee el convenio hasta el final."
          }
          error={estado.error}
        />
        <Boton type="submit" tamano="l" disabled={!leido || enviando}>
          {enviando ? "Guardando…" : "Acepto"}
        </Boton>
        <Link
          href="/app?despues=1"
          className="text-center text-pequeno text-text-secondary underline"
        >
          Ahora no, solo quiero marcar
        </Link>
      </section>
    </form>
  );
}
