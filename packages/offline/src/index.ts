// Cola local de marcajes (IndexedDB con Dexie). El marcaje se guarda primero aquí
// y después se envía; si no hay red, se queda pendiente y se reintenta. El envío
// es idempotente por client_event_id, así que reintentar nunca duplica.
import { bytesToHex, sha256 } from "@mijornada/dominio";
import Dexie, { type Table } from "dexie";

export interface MarcaPendiente<P> {
  clientEventId: string;
  /** Milisegundos Unix en que se hizo el marcaje. */
  creadoEn: number;
  /** Lo que se enviará a la API. */
  payload: P;
  /** Foto del marcaje (JPEG), si se tomó. Se sube después de registrar el evento. */
  foto?: Blob;
  estado: "pendiente" | "rechazado";
  intentos: number;
  /** Mensaje del servidor si rechazó el marcaje. */
  error?: string;
}

/** ok: llegó (o ya había llegado). rechazado: el servidor no lo acepta. reintentar: sin red o error temporal. */
export type ResultadoEnvio =
  { estado: "ok" } | { estado: "rechazado"; error: string } | { estado: "reintentar" };

/** Cómo se guarda una marca en IndexedDB: la foto va como bytes, no como Blob. */
type Fila<P> = Omit<MarcaPendiente<P>, "foto"> & { fotoBytes?: ArrayBuffer };

export class ColaMarcajes<P> {
  private readonly db: Dexie;
  private readonly marcas: Table<Fila<P>, string>;
  private sincronizando: Promise<number> | null = null;

  constructor(nombre: string) {
    this.db = new Dexie(nombre);
    this.db.version(1).stores({ marcas: "clientEventId, creadoEn, estado" });
    this.marcas = this.db.table("marcas");
  }

  /**
   * Guarda la marca. La foto se guarda como bytes porque Safari (iPhone, iPad) puede
   * fallar al guardar un Blob en IndexedDB. Si aun así la foto no se puede guardar,
   * la marca se guarda sin ella: registrar la jornada nunca se bloquea por la foto.
   * Devuelve false en ese caso.
   */
  async add(marca: Omit<MarcaPendiente<P>, "estado" | "intentos">): Promise<boolean> {
    const { foto, ...resto } = marca;
    const fila: Fila<P> = { ...resto, estado: "pendiente", intentos: 0 };
    if (foto) {
      try {
        await this.marcas.put({ ...fila, fotoBytes: await foto.arrayBuffer() });
        return true;
      } catch {
        await this.marcas.put(fila);
        return false;
      }
    }
    await this.marcas.put(fila);
    return true;
  }

  private async leer(estado: MarcaPendiente<P>["estado"]): Promise<MarcaPendiente<P>[]> {
    const filas = (await this.marcas.orderBy("creadoEn").toArray()).filter(
      (m) => m.estado === estado,
    );
    return filas.map(({ fotoBytes, ...resto }) => ({
      ...resto,
      ...(fotoBytes ? { foto: new Blob([fotoBytes], { type: "image/jpeg" }) } : {}),
    }));
  }

  /** Marcajes sin enviar, del más antiguo al más reciente. */
  pendientes(): Promise<MarcaPendiente<P>[]> {
    return this.leer("pendiente");
  }

  rechazados(): Promise<MarcaPendiente<P>[]> {
    return this.leer("rechazado");
  }

  async descartar(clientEventId: string): Promise<void> {
    await this.marcas.delete(clientEventId);
  }

  /**
   * Envía los pendientes en orden (la cadena de hashes depende del orden) y se
   * detiene en el primero que no se pueda enviar. Devuelve cuántos llegaron.
   */
  sync(send: (marca: MarcaPendiente<P>) => Promise<ResultadoEnvio>): Promise<number> {
    this.sincronizando ??= this.run(send).finally(() => {
      this.sincronizando = null;
    });
    return this.sincronizando;
  }

  private async run(send: (marca: MarcaPendiente<P>) => Promise<ResultadoEnvio>): Promise<number> {
    let enviados = 0;
    for (const marca of await this.pendientes()) {
      let resultado: ResultadoEnvio;
      try {
        resultado = await send(marca);
      } catch {
        resultado = { estado: "reintentar" };
      }

      if (resultado.estado === "ok") {
        await this.marcas.delete(marca.clientEventId);
        enviados += 1;
      } else if (resultado.estado === "rechazado") {
        await this.marcas.update(marca.clientEventId, (fila) => {
          fila.estado = "rechazado";
          fila.error = resultado.error;
        });
      } else {
        await this.marcas.update(marca.clientEventId, (fila) => {
          fila.intentos += 1;
        });
        break;
      }
    }
    return enviados;
  }
}

/** Valores sueltos que deben sobrevivir sin red (token del kiosco, último marcaje…). */
export class Almacen {
  private readonly db: Dexie;
  private readonly valores: Table<{ clave: string; valor: unknown }, string>;

  constructor(nombre: string) {
    this.db = new Dexie(nombre);
    this.db.version(1).stores({ valores: "clave" });
    this.valores = this.db.table("valores");
  }

  async get<T>(clave: string): Promise<T | undefined> {
    return (await this.valores.get(clave))?.valor as T | undefined;
  }

  async set(clave: string, valor: unknown): Promise<void> {
    await this.valores.put({ clave, valor });
  }

  async delete(clave: string): Promise<void> {
    await this.valores.delete(clave);
  }
}

/** SHA-256 en hexadecimal del contenido de un archivo (para foto_hash). */
export async function hashBlob(blob: Blob): Promise<string> {
  return bytesToHex(await sha256(new Uint8Array(await blob.arrayBuffer())));
}

/** Reduce una imagen a JPEG de `lado` px como máximo. */
export async function toJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  lado = 640,
): Promise<Blob> {
  const scale = Math.min(1, lado / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo procesar la foto."));
      },
      "image/jpeg",
      0.7,
    );
  });
}

/**
 * Convierte la foto que entrega la cámara en un JPEG reducido. Usa createImageBitmap
 * y, si el navegador no puede con ese archivo, una imagen normal como respaldo.
 */
export async function fotoDesdeArchivo(archivo: Blob, lado = 640): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(archivo);
    try {
      return await toJpeg(bitmap, bitmap.width, bitmap.height, lado);
    } finally {
      bitmap.close();
    }
  } catch {
    const url = URL.createObjectURL(archivo);
    try {
      const imagen = new Image();
      await new Promise<void>((resolve, reject) => {
        imagen.onload = () => {
          resolve();
        };
        imagen.onerror = () => {
          reject(new Error("No se pudo leer la foto."));
        };
        imagen.src = url;
      });
      return await toJpeg(imagen, imagen.naturalWidth, imagen.naturalHeight, lado);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Avisa al servidor de un error del dispositivo, para poder diagnosticarlo. No lleva datos personales. */
export function reportarError(donde: string, error: unknown): void {
  try {
    const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const cuerpo = JSON.stringify({ donde, detalle: detalle.slice(0, 500) });
    navigator.sendBeacon("/api/diagnostico", new Blob([cuerpo], { type: "application/json" }));
  } catch {
    // Sin red o sin sendBeacon: no hay nada más que hacer.
  }
}

/** Una sola lectura de ubicación; null si se niega, falla o tarda más de `timeoutMs`. */
export function ubicacionPuntual(
  timeoutMs = 8000,
): Promise<{ lat: number; lng: number; precision_m: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          precision_m: Math.round(position.coords.accuracy),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

const SYNC_TAG = "cola-marcajes";

/**
 * Pide al navegador que avise cuando vuelva la red (Background Sync). Donde no
 * existe (iOS), la cola se envía al abrir la app, al recuperar la conexión o cada 30 s.
 */
export async function pedirSincronizacion(): Promise<void> {
  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await registration.sync?.register(SYNC_TAG);
  } catch {
    // Sin service worker o sin permiso: quedan los otros disparadores.
  }
}

/** Ejecuta `callback` cuando el service worker avisa que hay que enviar la cola. Devuelve cómo dejar de escuchar. */
export function alSincronizar(callback: () => void): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;
  const listener = (event: MessageEvent) => {
    if ((event.data as { tipo?: string } | null)?.tipo === "sincronizar-cola") callback();
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => {
    navigator.serviceWorker.removeEventListener("message", listener);
  };
}
