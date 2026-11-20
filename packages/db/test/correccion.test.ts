// Hora declarada de las correcciones, conformidad del trabajador y hash versión 2.
import { computeEventHash, verifyChain, type ChainEvent } from "@mijornada/dominio";
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
        hash_version: 3,
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

describe("versiones del hash", () => {
  it("los eventos nuevos usan la versión 3, coinciden con dominio y conviven con los de versiones 1 y 2", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const entrada = await mark(tx, t, "entrada", "2026-11-10 09:00");
      await tx`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id, ts_declarado)
        values (${t.tenantId}, ${t.trabajadorA}, 'correccion', 'incidencia', ${t.dueno.usuario_id}, 'Llegó antes',
                ${entrada}, '2026-11-10T14:45:00.123456Z')`;
      await tx`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo, foto_estado, foto_motivo)
        values (${t.tenantId}, ${t.trabajadorA}, 'salida', 'import', ${t.dueno.usuario_id}, '2026-11-10T23:00:00Z',
                'no_disponible', 'NotReadableError: cámara ocupada')`;

      const chain = () => tx<ChainEvent[]>`
        select id, hash, hash_prev as "hashPrev", tenant_id as "tenantId", trabajador_id as "trabajadorId", tipo,
               to_char(ts_servidor at time zone 'UTC', ${sql.unsafe(TS)}) as "tsServidor",
               to_char(ts_dispositivo at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDispositivo",
               origen, lat::text as lat, lng::text as lng, foto_hash as "fotoHash", creado_por as "creadoPor",
               hash_version as "hashVersion",
               to_char(ts_declarado at time zone 'UTC', ${sql.unsafe(TS)}) as "tsDeclarado",
               foto_estado as "fotoEstado", foto_motivo as "fotoMotivo"
        from jornada.evento where tenant_id = ${t.tenantId} order by ts_servidor, id`;

      const eventos = await chain();
      expect(eventos.map((e) => e.hashVersion)).toEqual([3, 3, 3]);
      expect(eventos.map((e) => e.fotoEstado)).toEqual([
        "no_requerida",
        "no_requerida",
        "no_disponible",
      ]);
      expect(eventos[1]?.tsDeclarado).toBe("2026-11-10T14:45:00.123456Z");
      for (const evento of eventos) expect(evento.hash).toBe(await computeEventHash(evento));

      // Se reescribe la cadena como si el primer evento fuera anterior a ts_declarado (v1)
      // y el segundo anterior a foto_estado (v2): cada uno se verifica con su fórmula.
      await tx`set local session_replication_role = replica`;
      let hashPrev: string | null = null;
      for (const [index, evento] of eventos.entries()) {
        const version = ([1, 2, 3] as const)[index] ?? 3;
        const hash = await computeEventHash({ ...evento, hashPrev, hashVersion: version });
        await tx`update jornada.evento set hash_version = ${version}, hash_prev = ${hashPrev}, hash = ${hash}
                 where id = ${evento.id}`;
        hashPrev = hash;
      }
      await tx`set local session_replication_role = origin`;

      const verify = async () => {
        const [row] =
          await tx`select integra, n_eventos, motivo from jornada.verificar_cadena(${t.tenantId}, ${t.trabajadorA})`;
        return row;
      };
      expect(await verify()).toMatchObject({ integra: true, n_eventos: "3" });
      const mezclada = await chain();
      expect(mezclada.map((e) => e.hashVersion)).toEqual([1, 2, 3]);
      expect(await verifyChain(mezclada)).toEqual({ integra: true, nEventos: 3 });

      // Alterar el estado de la foto de un evento v3 rompe la cadena, en la base y en dominio.
      const tercero = mezclada[2];
      if (tercero === undefined) throw new Error("falta el tercer evento");
      await tx`set local session_replication_role = replica`;
      await tx`update jornada.evento set foto_estado = 'sin_camara', foto_motivo = null where id = ${tercero.id}`;
      await tx`set local session_replication_role = origin`;
      expect(await verify()).toMatchObject({
        integra: false,
        motivo: "el hash no corresponde al contenido del evento",
      });
      expect(await verifyChain(await chain())).toMatchObject({
        integra: false,
        eventoRotoId: tercero.id,
        motivo: "hash",
      });
    });
  });
});

describe("respuesta del trabajador, plazo y detalle de marcajes", () => {
  it("el trabajador responde una sola vez; la inconformidad exige comentario y no cambia la resolución", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const salida = await mark(tx, t, "salida", "2026-11-10 21:00");
      const incidencia = await openIncident(tx, t, t.dueno, {
        tipo: "correccion_hora",
        eventoReferido: salida,
        hora: "2026-11-10 18:00",
      });
      await resolve(tx, t.dueno, incidencia.id);

      const respond = (conforme: boolean, comentario: string | null) => (sp: Tx) =>
        sp`select cumplimiento.responder_incidencia(${incidencia.id}, ${conforme}, ${comentario})`;
      await asUser(tx, t.dueno, async () => {
        expect(await expectPgError(tx, respond(true, null))).toMatch(/Solo el propio trabajador/);
      });
      await asUser(tx, t.empleadoA, async () => {
        expect(await expectPgError(tx, respond(false, "  "))).toMatch(/Explica por qué/);
        await respond(false, "Salí a las 21:00, no a las 18:00")(tx);
        expect(await expectPgError(tx, respond(true, null))).toMatch(/Ya respondiste/);
      });

      const [fila] = await tx`
        select estado, aceptada_en, inconforme_en is not null as inconforme, comentario_trabajador
        from cumplimiento.incidencia where id = ${incidencia.id}`;
      expect(fila).toEqual({
        estado: "aprobada",
        aceptada_en: null,
        inconforme: true,
        comentario_trabajador: "Salí a las 21:00, no a las 18:00",
      });
    });
  });

  it("una incidencia fuera del plazo de la regla queda como extemporánea, sin bloquearse", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const open = async (diasAtras: number) => {
        const [row] = await asUser(
          tx,
          t.empleadoA,
          () => tx<{ extemporanea: boolean; habiles: number }[]>`
            insert into cumplimiento.incidencia (tenant_id, trabajador_id, fecha, tipo, motivo, solicitado_por, extemporanea)
            values (${t.tenantId}, ${t.trabajadorA}, (now() at time zone ${CDMX})::date - ${diasAtras}::integer,
                    'permiso', 'Cita médica', ${t.empleadoA.usuario_id}, false)
            returning extemporanea,
              calculo.dias_habiles_entre(fecha, (now() at time zone ${CDMX})::date) as habiles`,
        );
        if (row === undefined) throw new Error("no se abrió");
        return row;
      };
      // 3 días naturales son a lo más 3 hábiles; 14 son 10 hábiles.
      expect((await open(3)).extemporanea).toBe(false);
      expect(await open(14)).toEqual({ extemporanea: true, habiles: 10 });

      expect(
        (await tx`select calculo.dias_habiles_entre('2026-11-13', '2026-11-20') as n`)[0]?.["n"],
      ).toBe(5);
      expect(
        (
          await tx`select calculo.regla_vigente('dias_para_reportar_incidencia', current_date) as n`
        )[0]?.["n"],
      ).toBe("5");
    });
  });

  it("el detalle de marcajes muestra original y corrección lado a lado, con quién autorizó y la conformidad", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, "entrada", "2026-11-10 09:00");
      const salida = await mark(tx, t, "salida", "2026-11-10 21:00");
      const correccion = await openIncident(tx, t, t.dueno, {
        tipo: "correccion_hora",
        eventoReferido: salida,
        hora: "2026-11-10 18:00",
      });
      await resolve(tx, t.dueno, correccion.id);
      const olvido = await openIncident(tx, t, t.empleadoA, {
        tipo: "olvido",
        tipoMarcaje: "entrada",
        hora: "2026-11-11 08:30",
      });
      await resolve(tx, t.supervisorA, olvido.id);

      const detalle = () => tx`
        select tipo, to_char(hora_original at time zone ${CDMX}, 'HH24:MI') as original,
               to_char(hora_vigente at time zone ${CDMX}, 'DD HH24:MI') as vigente,
               correccion_motivo, correccion_autorizo, incidencia_tipo, conformidad, solicitada_por, anulado
        from jornada.detalle_marcajes(${t.tenantId}, ${t.trabajadorA}, '2026-11-10', '2026-11-11')`;
      const filas = await asUser(tx, t.dueno, detalle);
      const correo = async (usuarioId: string) =>
        (await tx`select tenants.nombre_de_usuario(${usuarioId}) as n`)[0]?.["n"] as string;

      expect(filas.map((f) => ({ ...f }))).toEqual([
        {
          tipo: "entrada",
          original: "09:00",
          vigente: "10 09:00",
          correccion_motivo: null,
          correccion_autorizo: null,
          incidencia_tipo: null,
          conformidad: null,
          solicitada_por: null,
          anulado: false,
        },
        {
          tipo: "salida",
          original: "21:00",
          vigente: "10 18:00",
          correccion_motivo: "Se me olvidó marcar",
          correccion_autorizo: await correo(t.dueno.usuario_id),
          incidencia_tipo: "correccion_hora",
          conformidad: "sin_respuesta",
          solicitada_por: await correo(t.dueno.usuario_id),
          anulado: false,
        },
        {
          tipo: "entrada",
          original: null,
          vigente: "11 08:30",
          correccion_motivo: "Se me olvidó marcar",
          correccion_autorizo: await correo(t.supervisorA.usuario_id),
          incidencia_tipo: "olvido",
          conformidad: "conforme",
          solicitada_por: "Ana",
          anulado: false,
        },
      ]);

      // El trabajador ve los suyos; otro trabajador, no.
      expect(await asUser(tx, t.empleadoA, detalle)).toHaveLength(3);
      await asUser(tx, { ...t.empleadoA, trabajador_id: t.trabajadorB }, async () => {
        expect(await expectPgError(tx, detalle)).toMatch(/No tienes acceso/);
      });
    });
  });
});
