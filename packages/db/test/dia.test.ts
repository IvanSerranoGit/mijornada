// Día laboral: se deriva de jornada.evento y se puede reconstruir desde cero.
import { afterAll, describe, expect, it } from "vitest";
import { createTenant, inRollback, sql, type Tenant, type Tx } from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

const CDMX = "America/Mexico_City";

/** Inserta un marcaje cuya hora del dispositivo es `hora` local en la zona dada. */
async function mark(
  tx: Tx,
  t: Tenant,
  trabajadorId: string,
  tipo: string,
  hora: string,
  zona = CDMX,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo)
    values (${t.tenantId}, ${trabajadorId}, ${tipo}, 'import', ${t.dueno.usuario_id},
            ${hora}::timestamp at time zone ${zona})
    returning id`;
  if (row === undefined) throw new Error("El marcaje no se insertó.");
  return row.id;
}

interface Dia {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  pausas_min: number;
  minutos_trabajados: number;
  estado: string;
}

async function days(tx: Tx, t: Tenant, trabajadorId: string, zona = CDMX): Promise<Dia[]> {
  return tx<Dia[]>`
    select fecha::text,
           to_char(entrada at time zone ${zona}, 'HH24:MI') as entrada,
           to_char(salida at time zone ${zona}, 'HH24:MI') as salida,
           pausas_min, minutos_trabajados, estado
    from jornada.dia_laboral
    where tenant_id = ${t.tenantId} and trabajador_id = ${trabajadorId}
    order by fecha`;
}

describe("cálculo del día laboral", () => {
  it("jornada con pausa: entrada, salida, pausas y minutos trabajados", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-10 09:00");
      expect(await days(tx, t, t.trabajadorA)).toEqual([
        {
          fecha: "2026-11-10",
          entrada: "09:00",
          salida: null,
          pausas_min: 0,
          minutos_trabajados: 0,
          estado: "incompleto",
        },
      ]);

      await mark(tx, t, t.trabajadorA, "inicio_pausa", "2026-11-10 13:00");
      await mark(tx, t, t.trabajadorA, "fin_pausa", "2026-11-10 14:00");
      await mark(tx, t, t.trabajadorA, "salida", "2026-11-10 18:00");
      expect(await days(tx, t, t.trabajadorA)).toEqual([
        {
          fecha: "2026-11-10",
          entrada: "09:00",
          salida: "18:00",
          pausas_min: 60,
          minutos_trabajados: 480,
          estado: "completo",
        },
      ]);
    });
  });

  it("dos turnos el mismo día se suman", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      for (const [tipo, hora] of [
        ["entrada", "09:00"],
        ["salida", "13:00"],
        ["entrada", "15:00"],
        ["salida", "19:30"],
      ] as const) {
        await mark(tx, t, t.trabajadorA, tipo, `2026-11-10 ${hora}`);
      }
      expect(await days(tx, t, t.trabajadorA)).toMatchObject([
        { entrada: "09:00", salida: "19:30", minutos_trabajados: 510, estado: "completo" },
      ]);
    });
  });

  it("una jornada nocturna pertenece al día en que empezó", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-10 22:00");
      await mark(tx, t, t.trabajadorA, "salida", "2026-11-11 06:00");
      expect(await days(tx, t, t.trabajadorA)).toMatchObject([
        {
          fecha: "2026-11-10",
          entrada: "22:00",
          salida: "06:00",
          minutos_trabajados: 480,
          estado: "completo",
        },
      ]);

      // La noche siguiente es un día aparte y no se mezcla con la salida de la mañana.
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-11 22:00");
      expect(await days(tx, t, t.trabajadorA)).toMatchObject([
        { fecha: "2026-11-10", minutos_trabajados: 480, estado: "completo" },
        { fecha: "2026-11-11", entrada: "22:00", salida: null, estado: "incompleto" },
      ]);
    });
  });

  it("el día se cuenta en la zona horaria del centro del trabajador", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      // 23:30 en Tijuana ya es el día siguiente en Ciudad de México.
      await mark(tx, t, t.trabajadorB, "entrada", "2026-11-10 15:00", "America/Tijuana");
      await mark(tx, t, t.trabajadorB, "salida", "2026-11-10 23:30", "America/Tijuana");
      expect(await days(tx, t, t.trabajadorB, "America/Tijuana")).toMatchObject([
        { fecha: "2026-11-10", entrada: "15:00", salida: "23:30", minutos_trabajados: 510 },
      ]);
    });
  });

  it("un marcaje anulado deja de contar y el día queda como corregido", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-10 09:00");
      const salida = await mark(tx, t, t.trabajadorA, "salida", "2026-11-10 18:00");
      await tx`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, motivo, referencia_evento_id)
        values (${t.tenantId}, ${t.trabajadorA}, 'anulacion', 'incidencia', ${t.dueno.usuario_id}, 'Marcó por error', ${salida})`;
      expect(await days(tx, t, t.trabajadorA)).toMatchObject([
        {
          fecha: "2026-11-10",
          entrada: "09:00",
          salida: null,
          minutos_trabajados: 0,
          estado: "corregido",
        },
      ]);
    });
  });

  it("se puede borrar y reconstruir desde los eventos y da lo mismo", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-09 09:00");
      await mark(tx, t, t.trabajadorA, "inicio_pausa", "2026-11-09 14:00");
      await mark(tx, t, t.trabajadorA, "fin_pausa", "2026-11-09 14:45");
      await mark(tx, t, t.trabajadorA, "salida", "2026-11-09 18:00");
      await mark(tx, t, t.trabajadorA, "entrada", "2026-11-10 22:00");
      await mark(tx, t, t.trabajadorA, "salida", "2026-11-11 06:00");
      await mark(tx, t, t.trabajadorA2, "entrada", "2026-11-10 08:00");
      await mark(tx, t, t.trabajadorB, "entrada", "2026-11-10 15:00", "America/Tijuana");
      await mark(tx, t, t.trabajadorB, "salida", "2026-11-10 23:30", "America/Tijuana");

      const snapshot = () => tx`
        select trabajador_id, fecha::text, entrada, salida, pausas_min, minutos_trabajados, estado
        from jornada.dia_laboral where tenant_id = ${t.tenantId} order by trabajador_id, fecha`;
      const antes = await snapshot();
      expect(antes).toHaveLength(4);

      await tx`delete from jornada.dia_laboral where tenant_id = ${t.tenantId}`;
      expect(await snapshot()).toHaveLength(0);

      const [row] = await tx<{ dias: number }[]>`
        select jornada.recalcular_rango(${t.tenantId}, '2026-11-01', '2026-11-30') as dias`;
      expect(row?.dias).toBe(4);
      expect(await snapshot()).toEqual(antes);
    });
  });
});
