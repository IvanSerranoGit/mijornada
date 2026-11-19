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

export class ColaMarcajes<P> {
  private readonly db: Dexie;
  private readonly marcas: Table<MarcaPendiente<P>, string>;
  private sincronizando: Promise<number> | null = null;

  constructor(nombre: string) {
    this.db = new Dexie(nombre);
    this.db.version(1).stores({ marcas: "clientEventId, creadoEn, estado" });
    this.marcas = this.db.table("marcas");
  }

  async add(marca: Omit<MarcaPendiente<P>, "estado" | "intentos">): Promise<void> {
    await this.marcas.put({ ...marca, estado: "pendiente", intentos: 0 });
  }

  /** Marcajes sin enviar, del más antiguo al más reciente. */
  async pendientes(): Promise<MarcaPendiente<P>[]> {
    return (await this.marcas.orderBy("creadoEn").toArray()).filter(
      (m) => m.estado === "pendiente",
    );
  }

  async rechazados(): Promise<MarcaPendiente<P>[]> {
    return (await this.marcas.orderBy("creadoEn").toArray()).filter(
      (m) => m.estado === "rechazado",
    );
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
        await this.marcas.put({ ...marca, estado: "rechazado", error: resultado.error });
      } else {
        await this.marcas.put({ ...marca, intentos: marca.intentos + 1 });
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
