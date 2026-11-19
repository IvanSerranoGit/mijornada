// Hash encadenado de jornada.evento. Debe producir exactamente lo mismo que la
// función SQL jornada.calcular_hash_evento (ver supabase/migrations).
//
// Forma canónica: los campos unidos con "|" en UTF-8; un nulo es la cadena vacía;
// las horas van en UTC con microsegundos; lat y lng con seis decimales.
//
//   v1: los once campos de la fórmula original.
//   v2: el prefijo "v2", los once campos y ts_declarado (la hora que se afirma que
//       ocurrió el marcaje, en correcciones y marcajes por incidencia).
//
// Cada evento guarda su versión (jornada.evento.hash_version) y se verifica con ella.

/** Campos de un evento que entran al hash, en el orden de la fórmula. */
export interface EventHashInput {
  hashPrev: string | null;
  tenantId: string;
  trabajadorId: string;
  tipo: string;
  /** Hora en UTC con microsegundos (`2027-01-04T15:00:00.000000Z`) o `Date`. */
  tsServidor: string | Date;
  tsDispositivo: string | Date | null;
  origen: string;
  lat: string | number | null;
  lng: string | number | null;
  fotoHash: string | null;
  creadoPor: string;
  /** Solo entra al hash en la versión 2. */
  tsDeclarado?: string | Date | null;
  /** Versión de la fórmula; 1 si se omite. */
  hashVersion?: 1 | 2;
}

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CANONICAL_COORDINATE = /^-?\d+\.\d{6}$/;
const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/.test(hex)) {
    throw new Error(`Hexadecimal inválido: "${hex}".`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return new Uint8Array(digest);
}

/** Hora en la forma canónica del hash. Un `Date` solo tiene milisegundos: se completan con ceros. */
export function canonicalTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Fecha inválida.");
    }
    return value.toISOString().replace("Z", "000Z");
  }
  if (!CANONICAL_TIMESTAMP.test(value)) {
    throw new Error(`La hora "${value}" no está en la forma AAAA-MM-DDTHH:MM:SS.ffffffZ.`);
  }
  return value;
}

/** Coordenada con seis decimales, como la guarda Postgres en numeric(9, 6). */
export function canonicalCoordinate(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Coordenada inválida.");
    }
    const fixed = value.toFixed(6);
    return fixed === "-0.000000" ? "0.000000" : fixed;
  }
  if (!CANONICAL_COORDINATE.test(value)) {
    throw new Error(`La coordenada "${value}" no tiene seis decimales.`);
  }
  return value;
}

/** Cadena canónica sobre la que se calcula el SHA-256. */
export function canonicalEventString(event: EventHashInput): string {
  const v1 = [
    event.hashPrev ?? "",
    event.tenantId,
    event.trabajadorId,
    event.tipo,
    canonicalTimestamp(event.tsServidor),
    event.tsDispositivo === null ? "" : canonicalTimestamp(event.tsDispositivo),
    event.origen,
    canonicalCoordinate(event.lat),
    canonicalCoordinate(event.lng),
    event.fotoHash ?? "",
    event.creadoPor,
  ];
  if ((event.hashVersion ?? 1) === 1) {
    return v1.join("|");
  }
  const tsDeclarado = event.tsDeclarado == null ? "" : canonicalTimestamp(event.tsDeclarado);
  return ["v2", ...v1, tsDeclarado].join("|");
}

/** SHA-256 encadenado del evento, en hexadecimal. */
export async function computeEventHash(event: EventHashInput): Promise<string> {
  return bytesToHex(await sha256(encoder.encode(canonicalEventString(event))));
}

/** Evento de una cadena ya guardada. */
export interface ChainEvent extends EventHashInput {
  id: string;
  hash: string;
}

export type ChainResult =
  | { integra: true; nEventos: number }
  | {
      integra: false;
      /** Posición (desde 1) del primer evento roto. */
      nEventos: number;
      eventoRotoId: string;
      motivo: "hash_prev" | "hash";
    };

/**
 * Recorre la cadena de un trabajador (en orden de ts_servidor) y devuelve si está
 * íntegra o el primer punto de ruptura. `hashPrevInicial` es el hash del evento
 * anterior al primero de la lista, o null si la lista empieza la cadena.
 */
export async function verifyChain(
  events: readonly ChainEvent[],
  hashPrevInicial: string | null = null,
): Promise<ChainResult> {
  let hashPrev = hashPrevInicial;
  let position = 0;
  for (const event of events) {
    position += 1;
    if (event.hashPrev !== hashPrev) {
      return { integra: false, nEventos: position, eventoRotoId: event.id, motivo: "hash_prev" };
    }
    if (event.hash !== (await computeEventHash(event))) {
      return { integra: false, nEventos: position, eventoRotoId: event.id, motivo: "hash" };
    }
    hashPrev = event.hash;
  }
  return { integra: true, nEventos: position };
}
