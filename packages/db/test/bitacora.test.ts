// Bitácora inmutable: hash encadenado, verificación, raíz Merkle y reglas del seed.
import { computeEventHash, merkleRoot, verifyChain, type ChainEvent } from "@mijornada/dominio";
import { afterAll, describe, expect, it } from "vitest";
import {
  asRole,
  createTenant,
  expectPgError,
  inRollback,
  insertEvent,
  sql,
  type Tenant,
  type Tx,
} from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

const TS = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** Cadena de un trabajador con los campos en la forma canónica del hash. */
async function readChain(tx: Tx, tenant: Tenant, trabajadorId: string): Promise<ChainEvent[]> {
  return tx<ChainEvent[]>`
    select id,
           hash,
           hash_prev as "hashPrev",
           tenant_id as "tenantId",
           trabajador_id as "trabajadorId",
           tipo,
           to_char(ts_servidor at time zone 'UTC', ${sql.unsafe(TS)}) as "tsServidor",
           to_char(ts_dispositivo at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDispositivo",
           origen,
           lat::text as lat,
           lng::text as lng,
           foto_hash as "fotoHash",
           creado_por as "creadoPor",
           hash_version as "hashVersion",
           to_char(ts_declarado at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDeclarado",
           foto_estado as "fotoEstado",
           foto_motivo as "fotoMotivo"
    from jornada.evento
    where tenant_id = ${tenant.tenantId} and trabajador_id = ${trabajadorId}
    order by ts_servidor, id`;
}

interface Verificacion {
  integra: boolean;
  n_eventos: string;
  evento_roto_id: string | null;
  motivo: string | null;
}

async function verifyInDb(tx: Tx, tenant: Tenant, trabajadorId: string): Promise<Verificacion> {
  const [row] = await tx<Verificacion[]>`
    select * from jornada.verificar_cadena(${tenant.tenantId}, ${trabajadorId})`;
  if (row === undefined) throw new Error("verificar_cadena no devolvió fila");
  return row;
}

/** Altera un evento saltándose los triggers, como lo haría alguien con acceso total a la base. */
async function tamper(tx: Tx, statement: (tx: Tx) => Promise<unknown>): Promise<void> {
  await tx`set local session_replication_role = replica`;
  await statement(tx);
  await tx`set local session_replication_role = origin`;
}

describe("hash encadenado", () => {
  it("el hash de la base es determinista y coincide con el de packages/dominio", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`
        insert into jornada.evento
          (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo, lat, lng, foto_hash)
        values
          (${t.tenantId}, ${t.trabajadorA}, 'entrada', 'kiosco', ${t.dueno.usuario_id},
           '2026-11-16T15:00:00.5Z', 19.4326, -99.133209, ${"c".repeat(64)}),
          (${t.tenantId}, ${t.trabajadorA}, 'salida', 'pwa', ${t.dueno.usuario_id}, null, null, null, null)`;

      const chain = await readChain(tx, t, t.trabajadorA);
      expect(chain).toHaveLength(2);
      for (const event of chain) {
        expect(event.hash).toBe(await computeEventHash(event));
        expect(event.hash).toBe(await computeEventHash(event));
      }
      expect(chain[0]?.hashPrev).toBeNull();
      expect(chain[1]?.hashPrev).toBe(chain[0]?.hash);
    });
  });

  it("ignora el hash, hash_prev y ts_servidor que mande el cliente", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, hash, hash_prev, ts_servidor)
        values (${t.tenantId}, ${t.trabajadorA}, 'entrada', 'api', ${t.dueno.usuario_id},
                ${"f".repeat(64)}, ${"e".repeat(64)}, now() - interval '3 hours')`;
      const [event] = await readChain(tx, t, t.trabajadorA);
      expect(event?.hashPrev).toBeNull();
      expect(event?.hash).not.toBe("f".repeat(64));
      const [{ reciente } = { reciente: false }] = await tx<{ reciente: boolean }[]>`
        select ts_servidor > now() - interval '1 minute' as reciente from jornada.evento
        where tenant_id = ${t.tenantId}`;
      expect(reciente).toBe(true);
    });
  });

  it("cada trabajador tiene su propia cadena", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await insertEvent(tx, t, t.trabajadorA);
      await insertEvent(tx, t, t.trabajadorB);
      await insertEvent(tx, t, t.trabajadorA, "salida");

      const a = await readChain(tx, t, t.trabajadorA);
      const b = await readChain(tx, t, t.trabajadorB);
      expect(b[0]?.hashPrev).toBeNull();
      expect(a[1]?.hashPrev).toBe(a[0]?.hash);
    });
  });

  it("no duplica un evento con el mismo client_event_id", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const clientEventId = "00000000-0000-4000-8000-00000000e001";
      for (let i = 0; i < 2; i += 1) {
        await tx`insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, client_event_id)
                 values (${t.tenantId}, ${t.trabajadorA}, 'entrada', 'pwa', ${t.dueno.usuario_id}, ${clientEventId})`;
      }
      expect(await readChain(tx, t, t.trabajadorA)).toHaveLength(1);
    });
  });
});

describe("inmutabilidad", () => {
  it("rechaza UPDATE, DELETE y TRUNCATE, incluso para el rol de servicio", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const id = await insertEvent(tx, t, t.trabajadorA);

      expect(
        await expectPgError(
          tx,
          (sp) => sp`update jornada.evento set tipo = 'salida' where id = ${id}`,
        ),
      ).toMatch(/inmutable: no se permite UPDATE/);
      expect(
        await expectPgError(tx, (sp) => sp`delete from jornada.evento where id = ${id}`),
      ).toMatch(/inmutable: no se permite DELETE/);
      expect(await expectPgError(tx, (sp) => sp`truncate jornada.evento`)).toMatch(/inmutable/);

      await asRole(tx, "service_role", async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`update jornada.evento set tipo = 'salida' where id = ${id}`,
          ),
        ).toMatch(/permission denied/);
        expect(
          await expectPgError(tx, (sp) => sp`delete from jornada.evento where id = ${id}`),
        ).toMatch(/permission denied/);
      });
    });
  });

  it("una corrección debe apuntar a un evento existente del mismo trabajador", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const original = await insertEvent(tx, t, t.trabajadorA);
      const correccion = (trabajadorId: string, referencia: string) => (sp: Tx) => sp`
        insert into jornada.evento
          (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id, ts_declarado)
        values (${t.tenantId}, ${trabajadorId}, 'correccion', 'incidencia', ${t.dueno.usuario_id},
                'Marcó tarde', ${referencia}, now() - interval '1 hour')`;

      await correccion(t.trabajadorA, original)(tx);
      expect(await expectPgError(tx, correccion(t.trabajadorB, original))).toMatch(
        /no existe para este trabajador/,
      );
      expect(await readChain(tx, t, t.trabajadorA)).toHaveLength(2);
    });
  });
});

describe("verificación de la cadena", () => {
  it("una cadena sin alterar está íntegra, en la base y en dominio", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      for (const tipo of ["entrada", "inicio_pausa", "fin_pausa", "salida"]) {
        await insertEvent(tx, t, t.trabajadorA, tipo);
      }
      expect(await verifyInDb(tx, t, t.trabajadorA)).toMatchObject({
        integra: true,
        n_eventos: "4",
      });
      expect(await verifyChain(await readChain(tx, t, t.trabajadorA))).toEqual({
        integra: true,
        nEventos: 4,
      });
    });
  });

  it("detecta un evento alterado y señala el primer punto de ruptura", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ids: string[] = [];
      for (const tipo of ["entrada", "inicio_pausa", "fin_pausa", "salida"]) {
        ids.push(await insertEvent(tx, t, t.trabajadorA, tipo));
      }
      const alterado = ids[1] ?? "";
      await tamper(
        tx,
        (x) => x`update jornada.evento set ts_dispositivo = now() where id = ${alterado}`,
      );

      expect(await verifyInDb(tx, t, t.trabajadorA)).toMatchObject({
        integra: false,
        n_eventos: "2",
        evento_roto_id: alterado,
        motivo: "el hash no corresponde al contenido del evento",
      });
      expect(await verifyChain(await readChain(tx, t, t.trabajadorA))).toEqual({
        integra: false,
        nEventos: 2,
        eventoRotoId: alterado,
        motivo: "hash",
      });
    });
  });

  it("detecta un evento eliminado de en medio", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ids: string[] = [];
      for (const tipo of ["entrada", "inicio_pausa", "fin_pausa", "salida"]) {
        ids.push(await insertEvent(tx, t, t.trabajadorA, tipo));
      }
      await tamper(tx, (x) => x`delete from jornada.evento where id = ${ids[1] ?? ""}`);

      expect(await verifyInDb(tx, t, t.trabajadorA)).toMatchObject({
        integra: false,
        evento_roto_id: ids[2],
        motivo: "hash_prev no coincide con el hash del evento anterior",
      });
    });
  });
});

describe("raíz Merkle", () => {
  it.each([0, 1, 2, 3, 5, 8, 13])(
    "la base y dominio dan la misma raíz con %i hashes",
    async (n) => {
      const hashes = Array.from({ length: n }, (_, i) =>
        (i + 1).toString(16).padStart(2, "0").repeat(32),
      );
      const [row] = await sql<
        { raiz: string }[]
      >`select jornada.raiz_merkle(${hashes}::text[]) as raiz`;
      expect(row?.raiz).toBe(await merkleRoot(hashes));
    },
  );

  it("la raíz del día es reproducible y cambia si se altera un evento", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ids: string[] = [];
      for (const trabajador of [t.trabajadorA, t.trabajadorB, t.trabajadorA2]) {
        ids.push(await insertEvent(tx, t, trabajador));
      }
      const root = async () => {
        const [row] = await tx<{ hash_raiz: string; n_eventos: number }[]>`
          select * from jornada.raiz_merkle_dia(
            ${t.tenantId}, (now() at time zone 'America/Mexico_City')::date)`;
        if (row === undefined) throw new Error("sin raíz");
        return row;
      };

      const first = await root();
      expect(first.n_eventos).toBe(3);
      expect(await root()).toEqual(first);

      const hashes = await tx<{ hash: string }[]>`
        select hash from jornada.evento where tenant_id = ${t.tenantId} order by ts_servidor, id`;
      expect(first.hash_raiz).toBe(await merkleRoot(hashes.map((h) => h.hash)));

      await tamper(
        tx,
        (x) => x`update jornada.evento set hash = ${"0".repeat(64)} where id = ${ids[1] ?? ""}`,
      );
      expect((await root()).hash_raiz).not.toBe(first.hash_raiz);
    });
  });

  it("sella un día terminado, no lo vuelve a sellar y el sello es inmutable", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const seal = () => tx<{ hash_raiz: string; n_eventos: number; sellado_en: Date }[]>`
        select (s).hash_raiz, (s).n_eventos, (s).sellado_en
        from jornada.sellar_dia(${t.tenantId}, (now() at time zone 'America/Mexico_City')::date - 1) as s`;

      const [first] = await seal();
      expect(first).toMatchObject({ n_eventos: 0, hash_raiz: await merkleRoot([]) });
      expect((await seal())[0]).toEqual(first);

      expect(
        await expectPgError(
          tx,
          (sp) => sp`
          select jornada.sellar_dia(${t.tenantId}, (now() at time zone 'America/Mexico_City')::date)`,
        ),
      ).toMatch(/el día no ha terminado/);
      expect(
        await expectPgError(
          tx,
          (sp) => sp`update jornada.sello_diario set n_eventos = 9 where tenant_id = ${t.tenantId}`,
        ),
      ).toMatch(/inmutable/);
    });
  });
});

describe("reglas precargadas en calculo.regla", () => {
  it.each([
    ["2026-06-01", 48, 9, 4],
    ["2027-06-01", 46, 9, null],
    ["2028-06-01", 44, 10, null],
    ["2029-06-01", 42, 11, null],
    ["2030-06-01", 40, 12, null],
    ["2035-06-01", 40, 12, null],
  ] as const)("el %s: jornada %i h, tope extra %i h", async (fecha, jornada, tope, diasExtra) => {
    const [row] = await sql<Record<string, string | null>[]>`
      select calculo.regla_vigente('jornada_max_semanal', ${fecha}::date) as jornada,
             calculo.regla_vigente('tope_extra_semanal', ${fecha}::date) as tope,
             calculo.regla_vigente('tope_extra_diario', ${fecha}::date) as diario,
             calculo.regla_vigente('jornada_total_max_diaria', ${fecha}::date) as total,
             calculo.regla_vigente('dias_extra_max_semanal', ${fecha}::date) as dias_extra,
             calculo.regla_vigente('tope_extra_semanal_menor', ${fecha}::date) as menor`;
    expect(Number(row?.["jornada"])).toBe(jornada);
    expect(Number(row?.["tope"])).toBe(tope);
    expect(Number(row?.["diario"])).toBe(4);
    expect(Number(row?.["total"])).toBe(12);
    expect(Number(row?.["menor"])).toBe(0);
    expect(row?.["dias_extra"] === null ? null : Number(row?.["dias_extra"])).toBe(diasExtra);
  });

  it("la UMA 2026 es de 117.31 pesos diarios", async () => {
    const [row] = await sql<
      { uma: string }[]
    >`select calculo.regla_vigente('uma_diaria', '2026-06-01') as uma`;
    expect(Number(row?.uma)).toBe(117.31);
  });
});
