"use client";

import type { EventoCrear, ResultadoEvento, SemanaTrabajador } from "@mijornada/api";
import { uuidV7 } from "@mijornada/dominio";
import {
  Almacen,
  alSincronizar,
  ColaMarcajes,
  fotoDesdeArchivo,
  hashBlob,
  pedirSincronizacion,
  reportarError,
  ubicacionPuntual,
  type MarcaPendiente,
  type ResultadoEnvio,
} from "@mijornada/offline";
import { Boton, Chip, Logo, Tarjeta } from "@mijornada/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { salir } from "../(cuenta)/actions.ts";
import { createSupabaseBrowser } from "../../lib/supabase/client.ts";

type Payload = EventoCrear;

interface Props {
  trabajadorId: string;
  nombre: string;
  zona: string;
  fotoRequerida: boolean;
  hoy: string;
  ultimaMarca: SemanaTrabajador["ultimaMarca"];
  dias: SemanaTrabajador["dias"];
  estado: SemanaTrabajador["estado"];
  minutosSemana: number;
}

interface UltimaLocal {
  tipo: string;
  hora: string;
}

// Se crean en el navegador la primera vez que hacen falta (IndexedDB no existe en el servidor).
let cola: ColaMarcajes<Payload> | undefined;
let almacen: Almacen | undefined;
const getCola = () => (cola ??= new ColaMarcajes<Payload>("mijornada-pwa-cola"));
const getAlmacen = () => (almacen ??= new Almacen("mijornada-pwa"));

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Envía un marcaje de la cola: registra el evento y, si lleva foto, la sube. */
async function enviar(marca: MarcaPendiente<Payload>): Promise<ResultadoEnvio> {
  const response = await fetch("/api/v1/eventos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(marca.payload),
  });
  if (response.status === 401 || response.status === 429 || response.status >= 500)
    return { estado: "reintentar", detalle: `HTTP ${String(response.status)}` };
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { mensaje?: string } | null;
    return { estado: "rechazado", error: body?.mensaje ?? "El servidor no aceptó el marcaje." };
  }

  const { resultados } = (await response.json()) as { resultados: ResultadoEvento[] };
  const resultado = resultados[0];
  if (resultado === undefined) return { estado: "reintentar" };
  if (resultado.estado === "rechazado") {
    return {
      estado: "rechazado",
      error: resultado.error?.mensaje ?? "El servidor no aceptó el marcaje.",
    };
  }

  if (marca.foto && resultado.evento?.foto_url) {
    const { error } = await createSupabaseBrowser()
      .storage.from("marcajes")
      .upload(resultado.evento.foto_url, marca.foto, { contentType: "image/jpeg" });
    // Si ya estaba (reintento), no hay nada más que hacer.
    if (error && !/exist/i.test(error.message)) return { estado: "reintentar" };
  }
  return { estado: "ok" };
}

export function Marcador(props: Props) {
  const router = useRouter();
  const [ahora, setAhora] = useState<Date | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [rechazados, setRechazados] = useState<MarcaPendiente<Payload>[]>([]);
  const [local, setLocal] = useState<UltimaLocal | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  // El último marcaje conocido: el de este teléfono si es más reciente que el del servidor.
  const servidor = props.ultimaMarca;
  const ultima =
    local && (!servidor || new Date(local.hora) > new Date(servidor.hora))
      ? local
      : (servidor ?? null);
  const siguiente = ultima?.tipo === "entrada" ? "salida" : "entrada";

  const sincronizar = useCallback(async () => {
    const enviados = await getCola().sync(enviar);
    setPendientes((await getCola().pendientes()).length);
    setRechazados(await getCola().rechazados());
    if (enviados > 0) {
      // Lo que estaba "guardado en este teléfono" ya llegó: el aviso deja de ser cierto.
      setAviso(null);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    setAhora(new Date());
    setEnLinea(navigator.onLine);
    const reloj = setInterval(() => {
      setAhora(new Date());
    }, 1000);
    const reintento = setInterval(() => {
      void sincronizar();
    }, 30_000);
    const online = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const offline = () => {
      setEnLinea(false);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const dejarDeEscuchar = alSincronizar(() => {
      void sincronizar();
    });

    void getAlmacen()
      .get<UltimaLocal & { fecha: string }>("ultima")
      .then((guardada) => {
        if (guardada?.fecha === props.hoy) setLocal(guardada);
      });
    void sincronizar();

    return () => {
      clearInterval(reloj);
      clearInterval(reintento);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      dejarDeEscuchar();
    };
  }, [props.hoy, sincronizar]);

  async function marcar(archivo?: File) {
    setAviso(null);
    const hora = new Date();
    try {
      let foto: Blob | undefined;
      let sinFoto = false;
      if (archivo) {
        setOcupado("Procesando la foto…");
        try {
          foto = await fotoDesdeArchivo(archivo);
        } catch (error) {
          // La foto nunca impide registrar la jornada.
          sinFoto = true;
          reportarError("pwa:foto", error);
        }
      }

      setOcupado("Obteniendo tu ubicación…");
      const ubicacion = await ubicacionPuntual(8000);

      const payload: Payload = {
        trabajador_id: props.trabajadorId,
        client_event_id: uuidV7(hora.getTime()),
        tipo: siguiente,
        origen: "pwa",
        ts_dispositivo: hora.toISOString(),
        ...(ubicacion ?? {}),
        ...(foto ? { foto_hash: await hashBlob(foto) } : {}),
      };

      // Primero se guarda en el teléfono; después se intenta enviar.
      const fotoGuardada = await getCola().add({
        clientEventId: payload.client_event_id,
        creadoEn: hora.getTime(),
        payload,
        ...(foto ? { foto } : {}),
      });
      if (!fotoGuardada) sinFoto = true;
      void pedirSincronizacion();
      const nueva = { tipo: siguiente, hora: hora.toISOString() };
      setLocal(nueva);
      await getAlmacen().set("ultima", { ...nueva, fecha: props.hoy });
      setOcupado("Enviando…");
      await sincronizar();
      // "Registrada" solo cuando el servidor la tiene; si no, está guardada en el teléfono.
      const enviada = !(await getCola().pendientes()).some(
        (marca) => marca.clientEventId === payload.client_event_id,
      );
      setAviso(
        `${siguiente === "entrada" ? "Entrada" : "Salida"} ${enviada ? "registrada" : "guardada en este teléfono"} a las ${formatoHora(hora, props.zona)}.` +
          (sinFoto ? " No se pudo guardar la foto." : ""),
      );
    } catch (error) {
      reportarError("pwa:marcar", error);
      setAviso("No se pudo registrar. Intenta de nuevo.");
    } finally {
      setOcupado(null);
      if (inputFoto.current) inputFoto.current.value = "";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex items-center justify-between">
        <Logo tamano={28} />
        <form action={salir}>
          <Boton type="submit" estilo="fantasma">
            Salir
          </Boton>
        </form>
      </header>

      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-2 font-bold">Hola, {props.nombre}</h1>
        <p className="text-text-secondary first-letter:uppercase">
          {ahora
            ? new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeZone: props.zona }).format(
                ahora,
              )
            : " "}
        </p>
        <p className="font-titulo text-hora-grande font-bold tabular-nums" aria-live="off">
          {ahora ? formatoHora(ahora, props.zona) : "--:--"}
        </p>
      </section>

      <input
        ref={inputFoto}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(event) => {
          const archivo = event.target.files?.[0];
          if (archivo) void marcar(archivo);
        }}
      />
      <Boton
        tamano="l"
        className="py-(--espacio-lg) text-titulo-3"
        disabled={ocupado !== null}
        onClick={() => {
          if (props.fotoRequerida) inputFoto.current?.click();
          else void marcar();
        }}
      >
        {ocupado ?? (siguiente === "entrada" ? "Registrar entrada" : "Registrar salida")}
      </Boton>

      <div className="flex flex-wrap items-center gap-(--espacio-xs)" aria-live="polite">
        <Chip tono={props.estado.tono}>{props.estado.etiqueta}</Chip>
        {!enLinea ? <Chip tono="neutro">Sin conexión</Chip> : null}
        {pendientes > 0 ? (
          <Chip tono="alerta">
            {pendientes} {pendientes === 1 ? "marca pendiente" : "marcas pendientes"} de enviar
          </Chip>
        ) : null}
      </div>
      {aviso ? (
        <p role="status" className="text-pequeno text-text-secondary">
          {aviso}
          {pendientes > 0 ? " Se enviará sola cuando haya conexión; no la repitas." : ""}
        </p>
      ) : ultima ? (
        <p className="text-pequeno text-text-secondary">
          Último registro: {ultima.tipo === "entrada" ? "entrada" : "salida"} a las{" "}
          {formatoHora(new Date(ultima.hora), props.zona)}.
        </p>
      ) : null}

      {rechazados.map((marca) => (
        <div
          key={marca.clientEventId}
          className="rounded-(--radio-md) bg-status-critical-soft p-(--espacio-md) text-pequeno"
        >
          <p className="font-medium text-status-critical">Una marca no se pudo registrar</p>
          <p>
            {formatoHora(new Date(marca.creadoEn), props.zona)} · {marca.error}
          </p>
          <Boton
            estilo="fantasma"
            onClick={() => {
              void getCola().descartar(marca.clientEventId).then(sincronizar);
            }}
          >
            Entendido
          </Boton>
        </div>
      ))}

      <Tarjeta className="flex flex-col gap-(--espacio-sm)">
        <div className="flex items-baseline justify-between">
          <h2 className="font-titulo text-titulo-3 font-bold">Tu semana</h2>
          <p className="text-pequeno text-text-secondary">
            {(props.minutosSemana / 60).toFixed(1)} h
          </p>
        </div>
        <ul className="divide-y divide-border-default">
          {props.dias.map((dia, index) => (
            <li
              key={dia.fecha}
              className="flex items-center justify-between py-(--espacio-xs) text-pequeno"
            >
              <span className={dia.fecha === props.hoy ? "font-medium" : "text-text-secondary"}>
                {DIAS[index]}
              </span>
              <span className="tabular-nums">
                {dia.entrada
                  ? `${formatoHora(new Date(dia.entrada), props.zona)} → ${dia.salida ? formatoHora(new Date(dia.salida), props.zona) : "…"}`
                  : "–"}
              </span>
              <span className="w-14 text-right tabular-nums text-text-secondary">
                {dia.minutosTrabajados > 0 ? `${(dia.minutosTrabajados / 60).toFixed(1)} h` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </main>
  );
}

function formatoHora(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);
}
