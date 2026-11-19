// Hora declarada de las correcciones, conformidad del trabajador y hash versión 2.
import { computeEventHash, type EventHashInput } from "@mijornada/dominio";
import { afterAll, describe, expect, it } from "vitest";
import {
  asUser,
  createTenant,
  expectPgError,
  inRollback,
  sql,
  type Claims,
  type Tenant,
  type Tx,
} from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

const CDMX = "America/Mexico_City";
const TS = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

async function mark(tx: Tx, t: Tenant, tipo: string, hora: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo)
    values (${t.tenantId}, ${t.trabajadorA}, ${tipo}, 'import', ${t.dueno.usuario_id}, ${hora}::timestamp at time zone ${CDMX})
    returning id`;
  return row?.id ?? "";
}

async function day(tx: Tx, t: Tenant, fecha: string) {
  const [row] = await tx<
    { entrada: string | null; salida: string | null; minutos: number; estado: string }[]
  >`
    select to_char(entrada at time zone ${CDMX}, 'HH24:MI') as entrada,
           to_char(salida at time zone ${CDMX}, 'HH24:MI') as salida,
           minutos_trabajados as minutos, estado
    from jornada.dia_laboral
    where tenant_id = ${t.tenantId} and trabajador_id = ${t.trabajadorA} and fecha = ${fecha}`;
  return row;
}

interface Incidencia {
  id: string;
  aceptada_por: string | null;
  aceptada_en: Date | null;
}

/** Abre una incidencia como el usuario dado. */
async function openIncident(
  tx: Tx,
  t: Tenant,
  who: Claims,
  datos: { tipo: string; eventoReferido?: string; tipoMarcaje?: string; hora?: string },
): Promise<Incidencia> {
  return asUser(tx, who, async () => {
    const [row] = await tx<Incidencia[]>`
      insert into cumplimiento.incidencia
        (tenant_id, trabajador_id, fecha, tipo, motivo, solicitado_por, evento_referido_id, tipo_marcaje, ts_declarado,
         aceptada_por, aceptada_en)
      values (${t.tenantId}, ${t.trabajadorA}, '2026-11-10', ${datos.tipo}, 'Se me olvidó marcar', ${who.usuario_id},
              ${datos.eventoReferido ?? null}, ${datos.tipoMarcaje ?? null},
              ${datos.hora ?? null}::timestamp at time zone ${CDMX},
              ${t.dueno.usuario_id}, now())
      returning id, aceptada_por, aceptada_en`;
    if (row === undefined) throw new Error("No se abrió la incidencia.");
    return row;
  });
}

const resolve = (tx: Tx, who: Claims, id: string, aprobar = true) =>
  asUser(tx, who, async () => {
    const [row] = await tx<{ evento: string | null }[]>`
      select cumplimiento.resolver_incidencia(${id}, ${aprobar}) as evento`;
    return row?.evento ?? null;
  });

describe("corrección de hora", () => {
  it("el día usa la hora declarada; se conservan la marca original, ambas horas, el motivo y quién aprobó", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, "entrada", "2026-11-10 09:00");
      const salida = await mark(tx, t, "salida", "2026-11-10 21:00");
      expect(await day(tx, t, "2026-11-10")).toMatchObject({
        salida: "21:00",
        minutos: 720,
        estado: "completo",
      });

      // La trabajadora pide corregir su salida: en realidad salió a las 18:00.
      const incidencia = await openIncident(tx, t, t.empleadoA, {
        tipo: "correccion_hora",
        eventoReferido: salida,
        hora: "2026-11-10 18:00",
      });
      // La abrió ella misma: nace con su conformidad (lo que mande el cliente se ignora).
      expect(incidencia.aceptada_por).toBe(t.empleadoA.usuario_id);
      expect(incidencia.aceptada_en).not.toBeNull();

      const eventoId = await resolve(tx, t.supervisorA, incidencia.id);
      expect(await day(tx, t, "2026-11-10")).toMatchObject({
        entrada: "09:00",
        salida: "18:00",
        minutos: 540,
        estado: "corregido",
      });

      const [correccion] = await tx`
        select tipo, origen, motivo, creado_por, referencia_evento_id, hash_version,
               to_char(ts_declarado at time zone ${CDMX}, 'HH24:MI') as declarada,
               ts_servidor > now() - interval '1 minute' as registrada_ahora
        from jornada.evento where id = ${eventoId}`;
      expect(correccion).toEqual({
        tipo: "correccion",
        origen: "incidencia",
        motivo: "Se me olvidó marcar",
        creado_por: t.supervisorA.usuario_id,
        referencia_evento_id: salida,
        hash_version: 2,
        declarada: "18:00",
        registrada_ahora: true,
      });

      // La marca original sigue intacta y la cadena, íntegra.
      const [original] = await tx`
        select to_char(ts_dispositivo at time zone ${CDMX}, 'HH24:MI') as hora from jornada.evento where id = ${salida}`;
      expect(original?.["hora"]).toBe("21:00");
      const [cadena] =
        await tx`select integra, n_eventos from jornada.verificar_cadena(${t.tenantId}, ${t.trabajadorA})`;
      expect(cadena).toMatchObject({ integra: true, n_eventos: "3" });

      const [resuelta] = await tx`
        select estado, resuelto_por, evento_resultante_id from cumplimiento.incidencia where id = ${incidencia.id}`;
      expect(resuelta).toEqual({
        estado: "aprobada",
        resuelto_por: t.supervisorA.usuario_id,
        evento_resultante_id: eventoId,
      });
    });
  });

  it("una corrección sin hora declarada no se acepta, y los clientes no pueden declarar horas", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const entrada = await mark(tx, t, "entrada", "2026-11-10 09:00");

      expect(
        await expectPgError(
          tx,
          (sp) => sp`
          insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id)
          values (${t.tenantId}, ${t.trabajadorA}, 'correccion', 'incidencia', ${t.dueno.usuario_id}, 'x', ${entrada})`,
        ),
      ).toMatch(/evento_correccion_declara_hora/);

      await asUser(tx, t.empleadoA, async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`
            insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_declarado)
            values (${t.tenantId}, ${t.trabajadorA}, 'salida', 'pwa', ${t.empleadoA.usuario_id}, now() - interval '3 hours')`,
          ),
        ).toMatch(/row-level security/);
      });
    });
  });
});

describe("olvido de marca y conformidad del trabajador", () => {
  it("si la abre el patrón queda sin conformidad hasta que el trabajador la acepta", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, "entrada", "2026-11-10 09:00");
      expect(await day(tx, t, "2026-11-10")).toMatchObject({ estado: "incompleto", salida: null });

      const incidencia = await openIncident(tx, t, t.dueno, {
        tipo: "olvido",
        tipoMarcaje: "salida",
        hora: "2026-11-10 18:30",
      });
      expect(incidencia).toMatchObject({ aceptada_por: null, aceptada_en: null });

      const eventoId = await resolve(tx, t.dueno, incidencia.id);
      const [evento] =
        await tx`select tipo, origen, referencia_evento_id from jornada.evento where id = ${eventoId}`;
      expect(evento).toEqual({ tipo: "salida", origen: "incidencia", referencia_evento_id: null });
      expect(await day(tx, t, "2026-11-10")).toMatchObject({
        salida: "18:30",
        minutos: 570,
        estado: "corregido",
      });

      // Sin conformidad del trabajador: así debe salir en el reporte.
      const conformidad = async () => {
        const [row] =
          await tx`select aceptada_por, aceptada_en is not null as aceptada from cumplimiento.incidencia where id = ${incidencia.id}`;
        return row;
      };
      expect(await conformidad()).toEqual({ aceptada_por: null, aceptada: false });

      // Solo el propio trabajador puede darla.
      for (const otro of [t.dueno, t.supervisorA]) {
        await asUser(tx, otro, async () => {
          expect(
            await expectPgError(
              tx,
              (sp) => sp`select cumplimiento.aceptar_incidencia(${incidencia.id})`,
            ),
          ).toMatch(/Solo el propio trabajador/);
        });
      }
      await asUser(tx, t.empleadoA, async () => {
        await tx`select cumplimiento.aceptar_incidencia(${incidencia.id})`;
      });
      expect(await conformidad()).toEqual({ aceptada_por: t.empleadoA.usuario_id, aceptada: true });
    });
  });

  it("una incidencia rechazada no genera eventos ni cambia el día", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, "entrada", "2026-11-10 09:00");
      const incidencia = await openIncident(tx, t, t.empleadoA, {
        tipo: "olvido",
        tipoMarcaje: "salida",
        hora: "2026-11-10 18:00",
      });
      expect(await resolve(tx, t.dueno, incidencia.id, false)).toBeNull();
      expect(await day(tx, t, "2026-11-10")).toMatchObject({ estado: "incompleto", salida: null });
      const [row] =
        await tx`select estado from cumplimiento.incidencia where id = ${incidencia.id}`;
      expect(row?.["estado"]).toBe("rechazada");
    });
  });
});

describe("hash versión 2", () => {
  it("los eventos nuevos usan la versión 2, coinciden con dominio y conviven con los de versión 1", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const entrada = await mark(tx, t, "entrada", "2026-11-10 09:00");
      await tx`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id, ts_declarado)
        values (${t.tenantId}, ${t.trabajadorA}, 'correccion', 'incidencia', ${t.dueno.usuario_id}, 'Llegó antes',
                ${entrada}, '2026-11-10T14:45:00.123456Z')`;

      const chain = () => tx<(EventHashInput & { id: string; hash: string })[]>`
        select id, hash, hash_prev as "hashPrev", tenant_id as "tenantId", trabajador_id as "trabajadorId", tipo,
               to_char(ts_servidor at time zone 'UTC', ${sql.unsafe(TS)}) as "tsServidor",
               to_char(ts_dispositivo at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDispositivo",
               origen, lat::text as lat, lng::text as lng, foto_hash as "fotoHash", creado_por as "creadoPor",
               hash_version as "hashVersion",
               to_char(ts_declarado at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDeclarado"
        from jornada.evento where tenant_id = ${t.tenantId} order by ts_servidor, id`;

      const eventos = await chain();
      expect(eventos.map((e) => e.hashVersion)).toEqual([2, 2]);
      expect(eventos[1]?.tsDeclarado).toBe("2026-11-10T14:45:00.123456Z");
      for (const evento of eventos) expect(evento.hash).toBe(await computeEventHash(evento));

      // Un evento anterior a esta versión (v1) sigue verificándose con su fórmula.
      await tx`set local session_replication_role = replica`;
      const v1 = { ...eventos[0], hashVersion: 1 as const } as EventHashInput;
      await tx`update jornada.evento set hash_version = 1, hash = ${await computeEventHash(v1)} where id = ${entrada}`;
      await tx`update jornada.evento set hash_prev = ${await computeEventHash(v1)} where id = ${eventos[1]?.id ?? ""}`;
      const segundo = (await chain())[1];
      if (segundo === undefined) throw new Error("falta el segundo evento");
      await tx`update jornada.evento set hash = ${await computeEventHash(segundo)} where id = ${segundo.id}`;
      await tx`set local session_replication_role = origin`;

      const verify = async () => {
        const [row] =
          await tx`select integra, motivo from jornada.verificar_cadena(${t.tenantId}, ${t.trabajadorA})`;
        return row;
      };
      expect(await verify()).toMatchObject({ integra: true });

      // Alterar la hora declarada rompe la cadena.
      await tx`set local session_replication_role = replica`;
      await tx`update jornada.evento set ts_declarado = ts_declarado + interval '1 hour' where id = ${segundo.id}`;
      await tx`set local session_replication_role = origin`;
      expect(await verify()).toMatchObject({
        integra: false,
        motivo: "el hash no corresponde al contenido del evento",
      });
    });
  });
});
