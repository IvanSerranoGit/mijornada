import { describe, expect, it } from "vitest";
import {
  computeWeek,
  resolveRule,
  resolveWorkRules,
  type DiaTrabajado,
  type Regla,
} from "../src/index.ts";

// Datos de prueba con la forma de calculo.regla. En producción las reglas se leen
// de la base; packages/db prueba que el seed coincide con este calendario.
const REGLAS: Regla[] = [
  {
    clave: "jornada_max_semanal",
    valor: 48,
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
  },
  {
    clave: "jornada_max_semanal",
    valor: 46,
    vigenteDesde: "2027-01-01",
    vigenteHasta: "2027-12-31",
  },
  {
    clave: "jornada_max_semanal",
    valor: 44,
    vigenteDesde: "2028-01-01",
    vigenteHasta: "2028-12-31",
  },
  {
    clave: "jornada_max_semanal",
    valor: 42,
    vigenteDesde: "2029-01-01",
    vigenteHasta: "2029-12-31",
  },
  { clave: "jornada_max_semanal", valor: 40, vigenteDesde: "2030-01-01", vigenteHasta: null },
  { clave: "tope_extra_semanal", valor: 9, vigenteDesde: "2026-01-01", vigenteHasta: "2027-12-31" },
  {
    clave: "tope_extra_semanal",
    valor: 10,
    vigenteDesde: "2028-01-01",
    vigenteHasta: "2028-12-31",
  },
  {
    clave: "tope_extra_semanal",
    valor: 11,
    vigenteDesde: "2029-01-01",
    vigenteHasta: "2029-12-31",
  },
  { clave: "tope_extra_semanal", valor: 12, vigenteDesde: "2030-01-01", vigenteHasta: null },
  { clave: "tope_extra_diario", valor: 4, vigenteDesde: "2026-01-01", vigenteHasta: null },
  { clave: "jornada_total_max_diaria", valor: 12, vigenteDesde: "2026-01-01", vigenteHasta: null },
  {
    clave: "dias_extra_max_semanal",
    valor: 4,
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
  },
  { clave: "tope_extra_semanal_menor", valor: 0, vigenteDesde: "2026-01-01", vigenteHasta: null },
];

const H = 60;

/** Semana que empieza en `inicio` (lunes) con las horas dadas por día y jornada pactada de 8 h. */
function semana(inicio: string, horas: number[], pactadaHoras: number | null = 8): DiaTrabajado[] {
  const base = new Date(`${inicio}T00:00:00Z`);
  return horas.map((h, i) => {
    const fecha = new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return {
      fecha,
      minutosTrabajados: Math.round(h * H),
      ...(pactadaHoras === null ? {} : { minutosJornadaPactada: pactadaHoras * H }),
    };
  });
}

const LUNES = {
  2026: "2026-06-01",
  2027: "2027-06-07",
  2028: "2028-06-05",
  2029: "2029-06-04",
  2030: "2030-06-03",
} as const;

describe("reglas por fecha", () => {
  it("resuelve la regla vigente en cada año del calendario", () => {
    expect(resolveRule(REGLAS, "jornada_max_semanal", "2026-12-31")).toBe(48);
    expect(resolveRule(REGLAS, "jornada_max_semanal", "2027-01-01")).toBe(46);
    expect(resolveRule(REGLAS, "jornada_max_semanal", "2035-01-01")).toBe(40);
    expect(resolveRule(REGLAS, "jornada_max_semanal", "2025-12-31")).toBeNull();
    expect(resolveRule(REGLAS, "dias_extra_max_semanal", "2027-06-07")).toBeNull();
  });

  it("falla con un error claro si falta una regla obligatoria", () => {
    expect(() => resolveWorkRules(REGLAS, "2025-06-01")).toThrow(/jornada_max_semanal/);
  });
});

describe("horas ordinarias y extra por año", () => {
  it.each([
    [2026, 48, 0],
    [2027, 46, 2],
    [2028, 44, 4],
    [2029, 42, 6],
    [2030, 40, 8],
  ] as const)(
    "en %i, seis días de 8 h dan %i h ordinarias y %i h extra",
    (anio, ordinarias, extra) => {
      const r = computeWeek({
        dias: semana(LUNES[anio], [8, 8, 8, 8, 8, 8]),
        menorDeEdad: false,
        reglas: REGLAS,
      });
      expect(r.minutosOrdinarios).toBe(ordinarias * H);
      expect(r.minutosExtraDobles).toBe(extra * H);
      expect(r.minutosExtraTriples).toBe(0);
      expect(r.alertas.filter((a) => a.tipo === "tope_extra_semanal_excedido")).toEqual([]);
    },
  );

  it("en 2030 el sexto día de 8 h es todo tiempo extra y rebasa el tope diario de 4 h", () => {
    const r = computeWeek({
      dias: semana(LUNES[2030], [8, 8, 8, 8, 8, 8]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.alertas).toEqual([
      { tipo: "tope_extra_diario_excedido", fecha: "2030-06-08", minutos: 8 * H, limiteMin: 4 * H },
    ]);
  });

  it("en 2027 la jornada máxima semanal es de 46 h aunque no haya jornada pactada", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [9, 9, 9, 9, 9, 3], null),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.minutosOrdinarios).toBe(46 * H);
    expect(r.minutosExtraDobles).toBe(2 * H);
  });
});

describe("topes de tiempo extra", () => {
  it("2027: hasta 9 h extra semanales son dobles y sin alerta", () => {
    // 46 h ordinarias (5 × 8 + 6) + 9 h extra repartidas en tres días.
    const r = computeWeek({
      dias: semana(LUNES[2027], [11, 11, 11, 8, 8, 6]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.minutosOrdinarios).toBe(46 * H);
    expect(r.minutosExtraDobles).toBe(9 * H);
    expect(r.minutosExtraTriples).toBe(0);
    expect(r.alertas).toEqual([]);
  });

  it("2027: lo que rebasa 9 h extra semanales es triple y genera alerta", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [11, 11, 11, 9, 8, 6]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.minutosExtraDobles).toBe(9 * H);
    expect(r.minutosExtraTriples).toBe(1 * H);
    expect(r.alertas).toEqual([
      { tipo: "tope_extra_semanal_excedido", minutos: 10 * H, limiteMin: 9 * H },
    ]);
  });

  it.each([
    [2028, 10],
    [2029, 11],
    [2030, 12],
  ] as const)("en %i el tope semanal de tiempo extra es de %i h", (anio, tope) => {
    const dias = semana(LUNES[anio], [12, 12, 12, 12, 8, 0]);
    const r = computeWeek({ dias, menorDeEdad: false, reglas: REGLAS });
    expect(r.minutosExtraDobles).toBe(tope * H);
    expect(r.minutosExtraDobles + r.minutosExtraTriples).toBe(16 * H);
    expect(r.alertas).toContainEqual({
      tipo: "tope_extra_semanal_excedido",
      minutos: 16 * H,
      limiteMin: tope * H,
    });
  });

  it("alerta si un día tiene más de 4 h extra", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [12, 8, 8, 8, 8, 0]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.alertas).toEqual([]);

    const excedido = computeWeek({
      dias: semana(LUNES[2027], [12.5, 8, 8, 8, 8, 0]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(excedido.alertas).toContainEqual({
      tipo: "tope_extra_diario_excedido",
      fecha: "2027-06-07",
      minutos: 4.5 * H,
      limiteMin: 4 * H,
    });
  });

  it("alerta si la jornada total de un día pasa de 12 h", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [13, 8, 8, 8, 0, 0], 10),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.alertas).toEqual([
      {
        tipo: "jornada_total_diaria_excedida",
        fecha: "2027-06-07",
        minutos: 13 * H,
        limiteMin: 12 * H,
      },
    ]);
  });

  it("2026: alerta si hay tiempo extra en más de 4 días; en 2027 esa regla ya no aplica", () => {
    const horas = [9, 9, 9, 9, 9, 0];
    const r2026 = computeWeek({
      dias: semana(LUNES[2026], horas),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r2026.alertas).toEqual([{ tipo: "dias_extra_excedidos", dias: 5, limiteDias: 4 }]);

    const r2027 = computeWeek({
      dias: semana(LUNES[2027], horas),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r2027.alertas).toEqual([]);
  });
});

describe("menores de edad", () => {
  it("un menor sin tiempo extra no genera alertas", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [6, 6, 6, 6, 6, 6], 6),
      menorDeEdad: true,
      reglas: REGLAS,
    });
    expect(r).toEqual({
      minutosOrdinarios: 36 * H,
      minutosExtraDobles: 0,
      minutosExtraTriples: 0,
      alertas: [],
    });
  });

  it("cualquier tiempo extra de un menor genera alerta y no cuenta como doble", () => {
    const r = computeWeek({
      dias: semana(LUNES[2027], [7, 6, 6, 6, 6, 6], 6),
      menorDeEdad: true,
      reglas: REGLAS,
    });
    expect(r.minutosExtraDobles).toBe(0);
    expect(r.minutosExtraTriples).toBe(1 * H);
    expect(r.alertas).toEqual([{ tipo: "menor_con_tiempo_extra", minutos: 1 * H, limiteMin: 0 }]);
  });
});

describe("casos límite", () => {
  it("una semana sin días da ceros", () => {
    expect(computeWeek({ dias: [], menorDeEdad: false, reglas: REGLAS })).toEqual({
      minutosOrdinarios: 0,
      minutosExtraDobles: 0,
      minutosExtraTriples: 0,
      alertas: [],
    });
  });

  it("una semana que cruza el año usa las reglas de su primer día", () => {
    // Lunes 28-dic-2026 a sábado 2-ene-2027: aplica el máximo de 48 h de 2026.
    const r = computeWeek({
      dias: semana("2026-12-28", [8, 8, 8, 8, 8, 8]),
      menorDeEdad: false,
      reglas: REGLAS,
    });
    expect(r.minutosOrdinarios).toBe(48 * H);
    expect(r.minutosExtraDobles).toBe(0);
  });
});
