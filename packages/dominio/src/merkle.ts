// Raíz Merkle del sello diario. Debe producir exactamente lo mismo que la función
// SQL jornada.raiz_merkle (ver supabase/migrations).
//
//   hoja = SHA-256(0x00 || hash del evento)
//   nodo = SHA-256(0x01 || izquierdo || derecho)
//   un nodo sin pareja sube tal cual al nivel siguiente
//   sin eventos, la raíz es SHA-256 de la cadena vacía

import { bytesToHex, hexToBytes, sha256 } from "./hash.ts";

function concat(prefix: number, ...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(1 + parts.reduce((total, part) => total + part.length, 0));
  result[0] = prefix;
  let offset = 1;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Raíz Merkle (hex) de los hashes de evento, en el orden dado (ts_servidor, id). */
export async function merkleRoot(hashes: readonly string[]): Promise<string> {
  if (hashes.length === 0) {
    return bytesToHex(await sha256(new Uint8Array()));
  }

  let level = await Promise.all(hashes.map((hash) => sha256(concat(0x00, hexToBytes(hash)))));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left === undefined) {
        break;
      }
      next.push(right === undefined ? left : await sha256(concat(0x01, left, right)));
    }
    level = next;
  }

  const root = level[0];
  if (root === undefined) {
    throw new Error("No se pudo calcular la raíz Merkle.");
  }
  return bytesToHex(root);
}
