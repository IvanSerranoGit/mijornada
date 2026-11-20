"use client";

import { TIPOS_REPORTE, TITULO_REPORTE, type TipoReporte } from "@mijornada/api";
import { Boton, Campo, Selector } from "@mijornada/ui";
import { useActionState, useState } from "react";
import { compartir, generar, revocar } from "./actions.ts";

interface Props {
  hoy: string;
  inicioDeMes: string;
  centros: { id: string; nombre: string }[];
  personas: { id: string; nombre: string }[];
}

/** Formulario para generar un reporte. */
export function GenerarReporte({ hoy, inicioDeMes, centros, personas }: Props) {
  const [estado, accion, enviando] = useActionState(generar, {});
  const [tipo, setTipo] = useState<TipoReporte>("inspeccion");
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <Selector
        etiqueta="Tipo de reporte"
        name="tipo"
        value={tipo}
        onChange={(event) => {
          setTipo(event.target.value as TipoReporte);
        }}
      >
        {TIPOS_REPORTE.map((valor) => (
          <option key={valor} value={valor}>
            {TITULO_REPORTE[valor]}
          </option>
        ))}
      </Selector>
      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        <Campo
          etiqueta="Desde"
          name="desde"
          type="date"
          required
          defaultValue={inicioDeMes}
          max={hoy}
        />
        <Campo etiqueta="Hasta" name="hasta" type="date" required defaultValue={hoy} max={hoy} />
      </div>
      {tipo === "trabajador" ? (
        <Selector etiqueta="Persona" name="trabajador_id" required defaultValue="">
          <option value="" disabled>
            Elige a la persona
          </option>
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.nombre}
            </option>
          ))}
        </Selector>
      ) : centros.length > 1 ? (
        <Selector etiqueta="Centro de trabajo" name="centro_id" defaultValue="">
          <option value="">Todos los centros</option>
          {centros.map((centro) => (
            <option key={centro.id} value={centro.id}>
              {centro.nombre}
            </option>
          ))}
        </Selector>
      ) : null}
      <div className="flex flex-wrap items-center gap-(--espacio-sm)">
        <Boton type="submit" disabled={enviando}>
          {enviando ? "Generando…" : "Generar reporte"}
        </Boton>
        {estado.error ? (
          <p role="alert" className="text-pequeno text-status-critical">
            {estado.error}
          </p>
        ) : estado.ok ? (
          <p role="status" className="text-pequeno text-text-brand">
            {estado.ok}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Crea el enlace temporal de inspector de un reporte y lo muestra una sola vez. */
export function CompartirConInspector({ reporteId }: { reporteId: string }) {
  const [estado, accion, enviando] = useActionState(compartir, {});
  return (
    <div className="flex flex-col gap-(--espacio-xs)">
      <form action={accion}>
        <input type="hidden" name="reporte_id" value={reporteId} />
        <Boton type="submit" estilo="secundario" disabled={enviando}>
          Crear enlace para inspector
        </Boton>
      </form>
      {estado.enlace ? (
        <div
          role="status"
          className="rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md) text-pequeno"
        >
          <p className="font-medium">Enlace de inspector (vigente 72 horas)</p>
          <p className="font-mono break-all">{estado.enlace}</p>
          <p className="text-text-secondary">
            Cópialo ahora: no se vuelve a mostrar. Puedes revocarlo cuando quieras.
          </p>
        </div>
      ) : null}
      {estado.error ? (
        <p role="alert" className="text-pequeno text-status-critical">
          {estado.error}
        </p>
      ) : null}
    </div>
  );
}

export function RevocarAcceso({ accesoId }: { accesoId: string }) {
  const [estado, accion, enviando] = useActionState(revocar, {});
  return (
    <form action={accion} className="inline-flex items-center gap-(--espacio-xs)">
      <input type="hidden" name="acceso_id" value={accesoId} />
      <Boton type="submit" estilo="fantasma" disabled={enviando}>
        Revocar
      </Boton>
      {estado.error ? <span className="text-nota text-status-critical">{estado.error}</span> : null}
    </form>
  );
}
