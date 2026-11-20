"use client";

import { TIPOS_INCIDENCIA, TITULO_INCIDENCIA, type TipoIncidencia } from "@mijornada/api";
import { Boton, Campo, Selector } from "@mijornada/ui";
import { useActionState, useState } from "react";

export interface Resultado {
  ok?: string;
  error?: string;
}

export interface MarcaElegible {
  id: string;
  fecha: string;
  /** Texto listo para mostrar: "mar 10 nov · Salida 21:00". */
  etiqueta: string;
  trabajador_id: string;
}

interface Props {
  accion: (previo: Resultado, formData: FormData) => Promise<Resultado>;
  hoy: string;
  /** Marcas recientes que se pueden corregir. */
  marcas: MarcaElegible[];
  /** Personas entre las que elige el patrón; sin esto, la incidencia es de quien llama. */
  personas?: { id: string; nombre: string }[];
}

/** Formulario para abrir una incidencia; lo usan el panel y la PWA. */
export function FormularioIncidencia({ accion, hoy, marcas, personas }: Props) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [tipo, setTipo] = useState<TipoIncidencia>("olvido");
  const [persona, setPersona] = useState("");
  const [marca, setMarca] = useState("");
  const conHora = tipo === "olvido" || tipo === "correccion_hora";
  const elegibles = personas ? marcas.filter((m) => m.trabajador_id === persona) : marcas;
  const elegida = elegibles.find((m) => m.id === marca);

  return (
    <form action={enviar} className="flex flex-col gap-(--espacio-md)">
      {personas ? (
        <Selector
          etiqueta="Persona"
          name="trabajador_id"
          required
          value={persona}
          onChange={(event) => {
            setPersona(event.target.value);
            setMarca("");
          }}
        >
          <option value="" disabled>
            Elige a la persona
          </option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Selector>
      ) : null}
      <Selector
        etiqueta="¿Qué pasó?"
        name="tipo"
        value={tipo}
        onChange={(event) => {
          setTipo(event.target.value as TipoIncidencia);
        }}
      >
        {TIPOS_INCIDENCIA.map((valor) => (
          <option key={valor} value={valor}>
            {TITULO_INCIDENCIA[valor]}
          </option>
        ))}
      </Selector>

      {tipo === "correccion_hora" ? (
        <Selector
          etiqueta="Marca que se corrige"
          name="evento_referido_id"
          required
          value={marca}
          onChange={(event) => {
            setMarca(event.target.value);
          }}
        >
          <option value="" disabled>
            {elegibles.length === 0 ? "No hay marcas recientes" : "Elige la marca"}
          </option>
          {elegibles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta}
            </option>
          ))}
        </Selector>
      ) : null}
      {tipo === "olvido" ? (
        <Selector etiqueta="Marca que faltó" name="tipo_marcaje" defaultValue="entrada">
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
          <option value="inicio_pausa">Inicio de pausa</option>
          <option value="fin_pausa">Fin de pausa</option>
        </Selector>
      ) : null}

      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        {tipo === "correccion_hora" ? (
          <input type="hidden" name="fecha" value={elegida?.fecha ?? hoy} />
        ) : (
          <Campo etiqueta="Fecha" name="fecha" type="date" required defaultValue={hoy} max={hoy} />
        )}
        {conHora ? (
          <Campo
            etiqueta={tipo === "olvido" ? "Hora en que ocurrió" : "Hora correcta"}
            name="hora"
            type="time"
            required
          />
        ) : null}
      </div>
      <Campo etiqueta="Motivo" name="motivo" required maxLength={500} error={estado.error} />
      <div className="flex flex-wrap items-center gap-(--espacio-sm)">
        <Boton type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar"}
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
