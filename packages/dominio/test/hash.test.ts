import { describe, expect, it } from "vitest";
import {
  canonicalCoordinate,
  canonicalEventString,
  canonicalTimestamp,
  computeEventHash,
  merkleRoot,
  verifyChain,
  type ChainEvent,
  type EventHashInput,
} from "../src/index.ts";

const TENANT = "00000000-0000-0000-0000-000000000001";
const TRABAJADOR = "00000000-0000-0000-0000-0000000000b1";
const USUARIO = "00000000-0000-0000-0000-0000000000d1";

const entrada: EventHashInput = {
  hashPrev: null,
  tenantId: TENANT,
  trabajadorId: TRABAJADOR,
  tipo: "entrada",
  tsServidor: "2027-01-04T15:00:00.123456Z",
  tsDispositivo: "2027-01-04T14:59:58.000000Z",
  origen: "kiosco",
  lat: "19.432608",
  lng: "-99.133209",
  fotoHash: null,
  creadoPor: USUARIO,
};

/** Arma una cadena válida de `n` eventos alternando entrada y salida. */
async function buildChain(n: number): Promise<ChainEvent[]> {
  const chain: ChainEvent[] = [];
  let hashPrev: string | null = null;
  for (let i = 0; i < n; i += 1) {
    const input: EventHashInput = {
      ...entrada,
      hashPrev,
      tipo: i % 2 === 0 ? "entrada" : "salida",
      tsServidor: `2027-01-04T${String(8 + i).padStart(2, "0")}:00:00.000000Z`,
      tsDispositivo: null,
    };
    const hash = await computeEventHash(input);
    chain.push({ ...input, id: `evento-${String(i + 1)}`, hash });
    hashPrev = hash;
  }
  return chain;
}

describe("hash del evento", () => {
  it("coincide con un vector calculado de forma independiente (shasum)", async () => {
    expect(canonicalEventString(entrada)).toBe(
      `|${TENANT}|${TRABAJADOR}|entrada|2027-01-04T15:00:00.123456Z|2027-01-04T14:59:58.000000Z|kiosco|19.432608|-99.133209||${USUARIO}`,
    );
    expect(await computeEventHash(entrada)).toBe(
      "cbf350946e73a8e553f46a2b33de43013a18035abc26b65ab377a7ccd550bb9d",
    );
  });

  it("es determinista: la misma entrada da siempre el mismo hash", async () => {
    const [a, b] = await Promise.all([computeEventHash(entrada), computeEventHash({ ...entrada })]);
    expect(a).toBe(b);
  });

  it("cambia si cambia cualquiera de los once campos", async () => {
    const original = await computeEventHash(entrada);
    const variantes: EventHashInput[] = [
      { ...entrada, hashPrev: "a".repeat(64) },
      { ...entrada, tenantId: "00000000-0000-0000-0000-000000000002" },
      { ...entrada, trabajadorId: "00000000-0000-0000-0000-0000000000b2" },
      { ...entrada, tipo: "salida" },
      { ...entrada, tsServidor: "2027-01-04T15:00:00.123457Z" },
      { ...entrada, tsDispositivo: null },
      { ...entrada, origen: "pwa" },
      { ...entrada, lat: "19.432609" },
      { ...entrada, lng: null },
      { ...entrada, fotoHash: "b".repeat(64) },
      { ...entrada, creadoPor: "00000000-0000-0000-0000-0000000000d2" },
    ];
    const hashes = await Promise.all(variantes.map((v) => computeEventHash(v)));
    expect(new Set([original, ...hashes]).size).toBe(variantes.length + 1);
  });

  it("normaliza horas y coordenadas a la forma canónica", () => {
    expect(canonicalTimestamp(new Date("2027-01-04T15:00:00.120Z"))).toBe(
      "2027-01-04T15:00:00.120000Z",
    );
    expect(() => canonicalTimestamp("2027-01-04 15:00:00")).toThrow();
    expect(canonicalCoordinate(19.4326)).toBe("19.432600");
    expect(canonicalCoordinate(-0)).toBe("0.000000");
    expect(canonicalCoordinate(null)).toBe("");
    expect(() => canonicalCoordinate("19.43")).toThrow();
  });
});

describe("cadena de hashes", () => {
  it("una cadena sin alterar está íntegra", async () => {
    expect(await verifyChain(await buildChain(6))).toEqual({ integra: true, nEventos: 6 });
    expect(await verifyChain([])).toEqual({ integra: true, nEventos: 0 });
  });

  it("detecta un evento alterado y señala el primer punto de ruptura", async () => {
    const chain = await buildChain(6);
    const alterado = chain[2];
    if (alterado === undefined) throw new Error("cadena incompleta");
    chain[2] = { ...alterado, tsServidor: "2027-01-04T10:30:00.000000Z" };

    expect(await verifyChain(chain)).toEqual({
      integra: false,
      nEventos: 3,
      eventoRotoId: "evento-3",
      motivo: "hash",
    });
  });

  it("detecta un evento alterado aunque se recalcule su propio hash", async () => {
    const chain = await buildChain(6);
    const alterado = chain[2];
    if (alterado === undefined) throw new Error("cadena incompleta");
    const falsificado = { ...alterado, tipo: "salida" };
    chain[2] = { ...falsificado, hash: await computeEventHash(falsificado) };

    // El evento 3 pasa por sí solo, pero el 4 ya no apunta a su hash.
    expect(await verifyChain(chain)).toEqual({
      integra: false,
      nEventos: 4,
      eventoRotoId: "evento-4",
      motivo: "hash_prev",
    });
  });

  it("detecta un evento eliminado de en medio", async () => {
    const chain = await buildChain(6);
    chain.splice(3, 1);
    expect(await verifyChain(chain)).toMatchObject({
      integra: false,
      eventoRotoId: "evento-5",
      motivo: "hash_prev",
    });
  });

  it("verifica un tramo si se le da el hash del evento anterior", async () => {
    const chain = await buildChain(6);
    const tramo = chain.slice(3);
    expect(await verifyChain(tramo, chain[2]?.hash ?? null)).toEqual({
      integra: true,
      nEventos: 3,
    });
    expect(await verifyChain(tramo)).toMatchObject({ integra: false, motivo: "hash_prev" });
  });
});

describe("raíz Merkle", () => {
  const hashes = ["a", "b", "c", "d", "e"].map((c) => c.repeat(64));

  it("es reproducible: los mismos hashes en el mismo orden dan la misma raíz", async () => {
    expect(await merkleRoot(hashes)).toBe(await merkleRoot([...hashes]));
  });

  it("sin eventos es el SHA-256 de la cadena vacía", async () => {
    expect(await merkleRoot([])).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("cambia si cambia un hash, el orden o el número de eventos", async () => {
    const raiz = await merkleRoot(hashes);
    const alterados = [...hashes];
    alterados[1] = "f".repeat(64);
    const invertidos = [...hashes].reverse();

    const raices = await Promise.all([
      merkleRoot(alterados),
      merkleRoot(invertidos),
      merkleRoot(hashes.slice(0, 4)),
      merkleRoot([...hashes, "e".repeat(64)]),
    ]);
    expect(new Set([raiz, ...raices]).size).toBe(5);
  });

  it("con un solo evento la raíz es su hoja, distinta del hash del evento", async () => {
    const raiz = await merkleRoot(["a".repeat(64)]);
    expect(raiz).toMatch(/^[0-9a-f]{64}$/);
    expect(raiz).not.toBe("a".repeat(64));
  });
});
