"use client";

import { uuidV7 } from "@mijornada/dominio";
import {
  Almacen,
  alSincronizar,
  ColaMarcajes,
  hashBlob,
  pedirSincronizacion,
  describirError,
  reportarError,
  toJpeg,
  type MarcaPendiente,
  type ResultadoEnvio,
} from "@mijornada/offline";
import { Boton, Campo, Chip, Logo, Tarjeta, cx } from "@mijornada/ui";
import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";

interface Vinculo {
  token: string;
  centro: string;
  empresa: string;
  zona_horaria: string;
  foto: boolean;
}

interface Payload {
  client_event_id: string;
  ts_dispositivo: string;
  pin?: string;
  qr?: string;
  foto_hash?: string;
  /** Solo cuando el centro pide foto y no se pudo tomar: por qué. */
  foto_estado?: "no_disponible" | "sin_camara";
  foto_motivo?: string;
}

interface Marca {
  evento_id: string;
  nombre: string;
  tipo: string;
  foto_url: string | null;
}

/** Aviso de privacidad que una persona todavía no acepta; se muestra antes de su marca. */
interface AvisoPendiente {
  credencial: { pin: string } | { qr: string };
  nombre: string;
  documento_id: string;
  resumen_html: string;
}

type Confirmacion =
  | { clase: "ok"; nombre: string; tipo: string; hora: string }
  | { clase: "pendiente"; hora: string }
  | { clase: "error"; mensaje: string };

let cola: ColaMarcajes<Payload> | undefined;
let almacen: Almacen | undefined;
const getCola = () => (cola ??= new ColaMarcajes<Payload>("mijornada-kiosco-cola"));
const getAlmacen = () => (almacen ??= new Almacen("mijornada-kiosco"));

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "qr"] as const;

async function api(ruta: string, init: RequestInit, token?: string) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`/api/v1/kiosco${ruta}`, { ...init, headers });
}

const mensajeDe = async (response: Response) =>
  ((await response.json().catch(() => null)) as { mensaje?: string } | null)?.mensaje ??
  "No se pudo completar.";

export function Kiosco() {
  const [vinculo, setVinculo] = useState<Vinculo | null | undefined>(undefined);

  useEffect(() => {
    void getAlmacen()
      .get<Vinculo>("vinculo")
      .then((guardado) => {
        setVinculo(guardado ?? null);
      });
  }, []);

  if (vinculo === undefined) return <main className="min-h-screen" />;
  if (vinculo === null) {
    return (
      <Vincular
        onVinculado={(nuevo) => {
          void getAlmacen().set("vinculo", nuevo);
          setVinculo(nuevo);
        }}
      />
    );
  }
  return (
    <Marcaje
      vinculo={vinculo}
      onActualizado={(actual) => {
        void getAlmacen().set("vinculo", actual);
        setVinculo(actual);
      }}
      onDesvinculado={() => {
        void getAlmacen().delete("vinculo");
        setVinculo(null);
      }}
    />
  );
}

// ---------------------------------------------------------------- vinculación

function Vincular({ onVinculado }: { onVinculado: (vinculo: Vinculo) => void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function vincular() {
    setEnviando(true);
    setError(null);
    try {
      const response = await api("/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      if (!response.ok) setError(await mensajeDe(response));
      else onVinculado((await response.json()) as Vinculo);
    } catch {
      setError("No hay conexión. Para vincular el kiosco se necesita internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-xl) p-(--espacio-lg)">
      <Logo tipo="apilado" color="blanco" />
      <Tarjeta borde={false} className="w-full max-w-md">
        <form
          className="flex flex-col gap-(--espacio-md)"
          onSubmit={(event) => {
            event.preventDefault();
            void vincular();
          }}
        >
          <header className="flex flex-col gap-(--espacio-2xs)">
            <h1 className="font-titulo text-titulo-2 font-bold">Vincular este kiosco</h1>
            <p className="text-text-secondary">
              Teclea el código de 8 caracteres que aparece en el panel del negocio, en el centro de
              trabajo.
            </p>
          </header>
          <Campo
            etiqueta="Código de enlace"
            value={codigo}
            onChange={(event) => {
              setCodigo(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 8),
              );
            }}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD2345"
            error={error ?? undefined}
            required
          />
          <Boton type="submit" tamano="l" disabled={enviando || codigo.length !== 8}>
            {enviando ? "Vinculando…" : "Vincular"}
          </Boton>
        </form>
      </Tarjeta>
    </main>
  );
}

// ---------------------------------------------------------------- marcaje

function Marcaje({
  vinculo,
  onActualizado,
  onDesvinculado,
}: {
  vinculo: Vinculo;
  onActualizado: (vinculo: Vinculo) => void;
  onDesvinculado: () => void;
}) {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [pin, setPin] = useState("");
  const [modo, setModo] = useState<"pin" | "qr" | "admin">("pin");
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [aviso, setAviso] = useState<AvisoPendiente | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const respuestas = useRef(new Map<string, Marca | { error: string }>());
  const necesitaCamara = vinculo.foto || modo === "qr";

  const enviar = useCallback(
    async (marca: MarcaPendiente<Payload>): Promise<ResultadoEnvio> => {
      const response = await api(
        "/marcar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(marca.payload),
        },
        vinculo.token,
      );
      if (response.status === 401 || response.status === 403) {
        // El dueño desvinculó esta tablet: ya no puede marcar.
        onDesvinculado();
        return { estado: "reintentar" };
      }
      if (response.status === 429 || response.status >= 500) return { estado: "reintentar" };
      if (!response.ok) {
        const error = await mensajeDe(response);
        respuestas.current.set(marca.clientEventId, { error });
        return { estado: "rechazado", error };
      }

      const registrada = (await response.json()) as Marca;
      respuestas.current.set(marca.clientEventId, registrada);
      if (marca.foto && registrada.foto_url) {
        const subida = await api(
          `/foto/${registrada.evento_id}`,
          { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: marca.foto },
          vinculo.token,
        );
        if (!subida.ok && subida.status !== 422) return { estado: "reintentar" };
      }
      return { estado: "ok" };
    },
    [vinculo.token, onDesvinculado],
  );

  const sincronizar = useCallback(async () => {
    await getCola().sync(enviar);
    // Un PIN o QR no reconocido no se guarda: se descarta y se avisa en pantalla.
    for (const rechazada of await getCola().rechazados())
      await getCola().descartar(rechazada.clientEventId);
    setPendientes((await getCola().pendientes()).length);
  }, [enviar]);

  // Reloj, conexión y reintentos.
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
    void sincronizar();

    // La configuración puede haber cambiado en el panel (foto, nombre del centro).
    void api("/estado", { method: "GET" }, vinculo.token)
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) onDesvinculado();
        else if (response.ok)
          onActualizado({ ...vinculo, ...((await response.json()) as Omit<Vinculo, "token">) });
      })
      .catch(() => undefined);

    return () => {
      clearInterval(reloj);
      clearInterval(reintento);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      dejarDeEscuchar();
    };
    // Solo al montar: el vínculo se refresca una vez por carga.
  }, []);

  // Cámara frontal: para la foto del marcaje y para leer el QR.
  useEffect(() => {
    if (!necesitaCamara) return;
    let stream: MediaStream | undefined;
    let cancelado = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      .then((s) => {
        if (cancelado) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [necesitaCamara]);

  const marcar = useCallback(
    async (credencial: { pin: string } | { qr: string }) => {
      if (ocupado) return;
      setOcupado(true);
      const hora = new Date();
      try {
        // La foto nunca bloquea la marca: si el centro la pide y no se puede tomar o
        // guardar, la marca va sin ella y dice por qué (sin cámara o fallo técnico).
        const base: Payload = {
          client_event_id: uuidV7(hora.getTime()),
          ts_dispositivo: hora.toISOString(),
          ...credencial,
        };
        const marca = { clientEventId: base.client_event_id, creadoEn: hora.getTime() };
        const camara = video.current;
        let sinFoto: Pick<Payload, "foto_estado" | "foto_motivo"> = {};
        let guardada = false;
        if (vinculo.foto && camara && camara.videoWidth > 0) {
          try {
            const foto = await toJpeg(camara, camara.videoWidth, camara.videoHeight);
            await getCola().add({
              ...marca,
              payload: { ...base, foto_hash: await hashBlob(foto) },
              foto,
            });
            guardada = true;
          } catch (error) {
            reportarError("kiosco:foto", error);
            sinFoto = {
              foto_estado: "no_disponible",
              foto_motivo: describirError(error).slice(0, 120),
            };
          }
        } else if (vinculo.foto) {
          sinFoto = { foto_estado: "sin_camara" };
        }
        if (!guardada) await getCola().add({ ...marca, payload: { ...base, ...sinFoto } });
        const payload = base;
        void pedirSincronizacion();
        await sincronizar();

        const respuesta = respuestas.current.get(payload.client_event_id);
        respuestas.current.delete(payload.client_event_id);
        const horaTexto = formatoHora(hora, vinculo.zona_horaria);
        if (respuesta === undefined) setConfirmacion({ clase: "pendiente", hora: horaTexto });
        else if ("error" in respuesta)
          setConfirmacion({ clase: "error", mensaje: respuesta.error });
        else
          setConfirmacion({
            clase: "ok",
            nombre: respuesta.nombre,
            tipo: respuesta.tipo,
            hora: horaTexto,
          });
      } catch (error) {
        reportarError("kiosco:marcar", error);
        setConfirmacion({ clase: "error", mensaje: "No se pudo registrar. Intenta de nuevo." });
      } finally {
        setPin("");
        setModo("pin");
        setOcupado(false);
      }
    },
    [ocupado, sincronizar, vinculo.foto, vinculo.zona_horaria],
  );

  /**
   * Antes de marcar se pregunta si la persona tiene pendiente el aviso de privacidad.
   * Si lo tiene, se le muestra; si no hay red o la consulta falla, se marca directo:
   * registrar la jornada nunca espera al consentimiento.
   */
  const identificar = useCallback(
    async (credencial: { pin: string } | { qr: string }) => {
      if (ocupado || aviso) return;
      if (navigator.onLine) {
        try {
          const response = await api(
            "/aviso",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(credencial),
              signal: AbortSignal.timeout(4000),
            },
            vinculo.token,
          );
          if (response.ok) {
            const estado = (await response.json()) as
              { pendiente: false } | ({ pendiente: true } & Omit<AvisoPendiente, "credencial">);
            if (estado.pendiente) {
              setPin("");
              setModo("pin");
              setAviso({ ...estado, credencial });
              return;
            }
          }
        } catch {
          // Sin respuesta a tiempo: se marca sin preguntar.
        }
      }
      await marcar(credencial);
    },
    [aviso, marcar, ocupado, vinculo.token],
  );

  /** "Acepto y marco": registra la aceptación y después la marca. */
  const responderAviso = useCallback(
    async (acepta: boolean) => {
      if (!aviso) return;
      setAviso(null);
      if (acepta) {
        try {
          await api(
            "/aviso/aceptar",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...aviso.credencial, documento_id: aviso.documento_id }),
              signal: AbortSignal.timeout(8000),
            },
            vinculo.token,
          );
        } catch (error) {
          // La aceptación se volverá a pedir en la siguiente marca.
          reportarError("kiosco:aviso", error);
        }
      }
      await marcar(aviso.credencial);
    },
    [aviso, marcar, vinculo.token],
  );

  // Si nadie responde al aviso en un minuto, la tablet vuelve al inicio sin marcar.
  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => {
      setAviso(null);
    }, 60_000);
    return () => {
      clearTimeout(timer);
    };
  }, [aviso]);

  // La confirmación dura 3 segundos y vuelve al inicio.
  useEffect(() => {
    if (!confirmacion) return;
    const timer = setTimeout(() => {
      setConfirmacion(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [confirmacion]);

  // Lectura de QR con la cámara.
  useEffect(() => {
    if (modo !== "qr") return;
    const canvas = document.createElement("canvas");
    const timer = setInterval(() => {
      const camara = video.current;
      if (!camara || camara.videoWidth === 0) return;
      canvas.width = camara.videoWidth;
      canvas.height = camara.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(camara, 0, 0);
      const imagen = context.getImageData(0, 0, canvas.width, canvas.height);
      const codigo = jsQR(imagen.data, imagen.width, imagen.height);
      if (codigo && codigo.data.length >= 16) void identificar({ qr: codigo.data });
    }, 300);
    return () => {
      clearInterval(timer);
    };
  }, [modo, identificar]);

  async function desvincular(pinAdmin: string) {
    setOcupado(true);
    try {
      const response = await api(
        "/desvincular",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin_admin: pinAdmin }),
        },
        vinculo.token,
      );
      if (response.ok) onDesvinculado();
      else setConfirmacion({ clase: "error", mensaje: await mensajeDe(response) });
    } catch {
      setConfirmacion({
        clase: "error",
        mensaje: "Se necesita conexión para desvincular el kiosco.",
      });
    } finally {
      setPin("");
      setModo("pin");
      setOcupado(false);
    }
  }

  function teclear(tecla: (typeof TECLAS)[number]) {
    if (ocupado) return;
    if (tecla === "qr") {
      setPin("");
      setModo(modo === "qr" ? "pin" : "qr");
      return;
    }
    if (tecla === "borrar") {
      setPin(pin.slice(0, -1));
      return;
    }
    const largo = modo === "admin" ? 6 : 4;
    const nuevo = (pin + tecla).slice(0, largo);
    setPin(nuevo);
    if (nuevo.length === largo) {
      if (modo === "admin") void desvincular(nuevo);
      else void identificar({ pin: nuevo });
    }
  }

  if (aviso) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-(--espacio-lg) p-(--espacio-xl)">
        <div>
          <p className="text-etiqueta font-medium uppercase opacity-80">
            Antes de tu primera marca
          </p>
          <h1 className="font-titulo text-titulo-1 font-bold">Hola, {aviso.nombre}</h1>
        </div>
        <div
          className="documento rounded-(--radio-lg) bg-bg-surface p-(--espacio-lg) text-cuerpo text-text-primary"
          dangerouslySetInnerHTML={{ __html: aviso.resumen_html }}
        />
        <p className="text-pequeno opacity-80">
          El convenio completo lo puedes leer y firmar en tu celular, con el enlace que te comparta
          tu empresa.
        </p>
        <div className="flex flex-col gap-(--espacio-sm)">
          <Boton
            tamano="l"
            onClick={() => {
              void responderAviso(true);
            }}
          >
            Acepto y marco
          </Boton>
          <Boton
            estilo="fantasma"
            className="text-text-inverse"
            onClick={() => {
              void responderAviso(false);
            }}
          >
            Marcar sin aceptar por ahora
          </Boton>
        </div>
      </main>
    );
  }

  if (confirmacion) {
    return (
      <main
        role="status"
        className={cx(
          "flex min-h-screen flex-col items-center justify-center gap-(--espacio-md) p-(--espacio-xl) text-center",
          confirmacion.clase === "ok" && "bg-bg-brand",
        )}
      >
        {confirmacion.clase === "ok" ? (
          <>
            <p className="text-etiqueta font-medium uppercase opacity-80">
              {confirmacion.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"}
            </p>
            <p className="font-titulo text-display font-bold">{confirmacion.nombre}</p>
            <p className="font-titulo text-hora-grande font-bold tabular-nums">
              {confirmacion.hora}
            </p>
          </>
        ) : confirmacion.clase === "pendiente" ? (
          <>
            <p className="font-titulo text-titulo-1 font-bold">
              Marca guardada a las {confirmacion.hora}
            </p>
            <p className="text-titulo-3 opacity-80">
              No hay conexión: se enviará sola cuando vuelva.
            </p>
          </>
        ) : (
          <>
            <p className="font-titulo text-titulo-1 font-bold">No se registró</p>
            <p className="text-titulo-3 opacity-80">{confirmacion.mensaje}</p>
          </>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-between gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex w-full items-center justify-between">
        <Logo color="blanco" tamano={28} />
        <div className="flex items-center gap-(--espacio-xs)">
          {!enLinea ? <Chip tono="neutro">Sin conexión</Chip> : null}
          {pendientes > 0 ? (
            <Chip tono="alerta">
              {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
            </Chip>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col items-center gap-(--espacio-2xs) text-center">
        <p className="text-etiqueta font-medium uppercase opacity-70">
          {vinculo.empresa} · {vinculo.centro}
        </p>
        <p className="font-titulo text-[96px] leading-none font-bold tabular-nums">
          {ahora ? formatoHora(ahora, vinculo.zona_horaria) : "--:--"}
        </p>
        <p className="opacity-70 first-letter:uppercase">
          {ahora
            ? new Intl.DateTimeFormat("es-MX", {
                dateStyle: "full",
                timeZone: vinculo.zona_horaria,
              }).format(ahora)
            : " "}
        </p>
      </section>

      <video
        ref={video}
        muted
        playsInline
        aria-hidden={modo !== "qr"}
        className={cx(
          "rounded-(--radio-lg) object-cover",
          modo === "qr"
            ? "aspect-square w-64 -scale-x-100"
            : "pointer-events-none absolute size-px opacity-0",
        )}
      />

      <section className="flex w-full flex-col items-center gap-(--espacio-md)">
        <p className="text-titulo-3" aria-live="polite">
          {modo === "qr"
            ? "Muestra tu código QR a la cámara"
            : modo === "admin"
              ? "PIN de administrador (6 dígitos)"
              : "Teclea tu PIN"}
        </p>
        {modo !== "qr" ? (
          <div
            className="flex gap-(--espacio-sm)"
            aria-label={`${String(pin.length)} dígitos tecleados`}
          >
            {Array.from({ length: modo === "admin" ? 6 : 4 }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "size-4 rounded-full border-2 border-white",
                  i < pin.length && "bg-white",
                )}
              />
            ))}
          </div>
        ) : null}

        <div className="grid w-full max-w-xs grid-cols-3 gap-(--espacio-sm)">
          {TECLAS.map((tecla) => (
            <button
              key={tecla}
              type="button"
              disabled={ocupado}
              onClick={() => {
                teclear(tecla);
              }}
              className={cx(
                "flex h-20 items-center justify-center rounded-(--radio-lg) font-titulo font-bold transition-colors active:bg-white/30",
                tecla === "qr" || tecla === "borrar"
                  ? "text-pequeno uppercase"
                  : "bg-white/10 text-titulo-1",
                tecla === "qr" && modo === "qr" && "bg-bg-accent text-text-on-accent",
              )}
            >
              {tecla === "borrar"
                ? "Borrar"
                : tecla === "qr"
                  ? modo === "qr"
                    ? "Usar PIN"
                    : "Usar QR"
                  : tecla}
            </button>
          ))}
        </div>
      </section>

      <footer>
        <button
          type="button"
          className="text-nota opacity-50 underline"
          onClick={() => {
            setPin("");
            setModo(modo === "admin" ? "pin" : "admin");
          }}
        >
          {modo === "admin" ? "Cancelar" : "Desvincular este kiosco"}
        </button>
      </footer>
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
