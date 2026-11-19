// Cálculo de horas ordinarias y extraordinarias de una semana contra las reglas
// vigentes. Las reglas nunca son constantes: se leen de calculo.regla por fecha y
// se pasan a estas funciones.

/** Fila de calculo.regla. Las fechas son AAAA-MM-DD; `vigenteHasta` es inclusivo. */
export interface Regla {
  clave: string;
  valor: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

/** Reglas de jornada vigentes en una fecha, en minutos. */
export interface ReglasJornada {
  jornadaMaxSemanalMin: number;
  topeExtraSemanalMin: number;
  topeExtraDiarioMin: number;
  jornadaTotalMaxDiariaMin: number;
  /** Máximo de días por semana con tiempo extra; null si no hay regla vigente. */
  diasExtraMaxSemanal: number | null;
  topeExtraSemanalMenorMin: number;
}

/** Valor de una regla en una fecha, o null si no hay regla vigente ese día. */
export function resolveRule(reglas: readonly Regla[], clave: string, fecha: string): number | null {
  const regla = reglas.find(
    (r) =>
      r.clave === clave &&
      r.vigenteDesde <= fecha &&
      (r.vigenteHasta === null || r.vigenteHasta >= fecha),
  );
  return regla?.valor ?? null;
}

function requireRule(reglas: readonly Regla[], clave: string, fecha: string): number {
  const valor = resolveRule(reglas, clave, fecha);
  if (valor === null) {
    throw new Error(`No hay regla "${clave}" vigente el ${fecha}.`);
  }
  return valor;
}

export function resolveWorkRules(reglas: readonly Regla[], fecha: string): ReglasJornada {
  return {
    jornadaMaxSemanalMin: requireRule(reglas, "jornada_max_semanal", fecha) * 60,
    topeExtraSemanalMin: requireRule(reglas, "tope_extra_semanal", fecha) * 60,
    topeExtraDiarioMin: requireRule(reglas, "tope_extra_diario", fecha) * 60,
    jornadaTotalMaxDiariaMin: requireRule(reglas, "jornada_total_max_diaria", fecha) * 60,
    diasExtraMaxSemanal: resolveRule(reglas, "dias_extra_max_semanal", fecha),
    topeExtraSemanalMenorMin: requireRule(reglas, "tope_extra_semanal_menor", fecha) * 60,
  };
}

export interface DiaTrabajado {
  /** AAAA-MM-DD, en la zona horaria del centro de trabajo. */
  fecha: string;
  minutosTrabajados: number;
  /** Jornada pactada de ese día según el horario; lo que la exceda es tiempo extra. */
  minutosJornadaPactada?: number;
}

export type Alerta =
  | {
      tipo: "jornada_total_diaria_excedida" | "tope_extra_diario_excedido";
      fecha: string;
      minutos: number;
      limiteMin: number;
    }
  | {
      tipo: "tope_extra_semanal_excedido" | "menor_con_tiempo_extra";
      minutos: number;
      limiteMin: number;
    }
  | { tipo: "dias_extra_excedidos"; dias: number; limiteDias: number };

export interface ResumenSemana {
  minutosOrdinarios: number;
  /** Tiempo extra dentro del tope semanal (se paga doble). */
  minutosExtraDobles: number;
  /** Tiempo extra que rebasa el tope semanal (se paga triple). */
  minutosExtraTriples: number;
  alertas: Alerta[];
}

export interface SemanaInput {
  /** Días de una misma semana, en orden cronológico. */
  dias: readonly DiaTrabajado[];
  menorDeEdad: boolean;
  reglas: readonly Regla[];
}

/**
 * Calcula una semana. Se aplican las reglas vigentes el primer día de la semana.
 *
 * Es tiempo extra lo que excede la jornada pactada del día y lo que excede la
 * jornada máxima semanal. Sin jornada pactada, el excedente semanal se atribuye
 * a los días en que se rebasa el máximo acumulado.
 */
export function computeWeek({ dias, menorDeEdad, reglas }: SemanaInput): ResumenSemana {
  const primerDia = dias[0];
  if (primerDia === undefined) {
    return { minutosOrdinarios: 0, minutosExtraDobles: 0, minutosExtraTriples: 0, alertas: [] };
  }

  const vigentes = resolveWorkRules(reglas, primerDia.fecha);
  const alertas: Alerta[] = [];
  let minutosOrdinarios = 0;
  let minutosExtra = 0;
  let diasConExtra = 0;

  for (const dia of dias) {
    if (!Number.isInteger(dia.minutosTrabajados) || dia.minutosTrabajados < 0) {
      throw new Error(`Minutos trabajados inválidos el ${dia.fecha}.`);
    }

    const disponibleSemana = vigentes.jornadaMaxSemanalMin - minutosOrdinarios;
    const ordinariosDia = Math.min(
      dia.minutosTrabajados,
      dia.minutosJornadaPactada ?? Number.POSITIVE_INFINITY,
      disponibleSemana,
    );
    const extraDia = dia.minutosTrabajados - ordinariosDia;
    minutosOrdinarios += ordinariosDia;
    minutosExtra += extraDia;

    if (extraDia > 0) {
      diasConExtra += 1;
    }
    if (dia.minutosTrabajados > vigentes.jornadaTotalMaxDiariaMin) {
      alertas.push({
        tipo: "jornada_total_diaria_excedida",
        fecha: dia.fecha,
        minutos: dia.minutosTrabajados,
        limiteMin: vigentes.jornadaTotalMaxDiariaMin,
      });
    }
    if (extraDia > vigentes.topeExtraDiarioMin) {
      alertas.push({
        tipo: "tope_extra_diario_excedido",
        fecha: dia.fecha,
        minutos: extraDia,
        limiteMin: vigentes.topeExtraDiarioMin,
      });
    }
  }

  // Un menor de edad no puede generar tiempo extra: su tope es el de la regla (cero).
  const topeSemanal = menorDeEdad
    ? vigentes.topeExtraSemanalMenorMin
    : vigentes.topeExtraSemanalMin;
  const minutosExtraDobles = Math.min(minutosExtra, topeSemanal);
  const minutosExtraTriples = minutosExtra - minutosExtraDobles;

  if (minutosExtra > topeSemanal) {
    alertas.push({
      tipo: menorDeEdad ? "menor_con_tiempo_extra" : "tope_extra_semanal_excedido",
      minutos: minutosExtra,
      limiteMin: topeSemanal,
    });
  }
  if (vigentes.diasExtraMaxSemanal !== null && diasConExtra > vigentes.diasExtraMaxSemanal) {
    alertas.push({
      tipo: "dias_extra_excedidos",
      dias: diasConExtra,
      limiteDias: vigentes.diasExtraMaxSemanal,
    });
  }

  return { minutosOrdinarios, minutosExtraDobles, minutosExtraTriples, alertas };
}

export interface EstadoSemana {
  tono: "bien" | "alerta" | "critico";
  etiqueta: string;
}

/** A partir de qué fracción del tope semanal de tiempo extra se avisa que se está cerca. */
const UMBRAL_CERCA_DEL_TOPE = 0.75;

/** Resume una semana en un estado para mostrar (chip): bien, alerta o crítico. */
export function weekStatus(
  resumen: ResumenSemana,
  vigentes: ReglasJornada,
  menorDeEdad: boolean,
): EstadoSemana {
  const tipos = new Set(resumen.alertas.map((alerta) => alerta.tipo));
  const extra = resumen.minutosExtraDobles + resumen.minutosExtraTriples;

  if (tipos.has("menor_con_tiempo_extra")) {
    return { tono: "critico", etiqueta: "Menor de edad con tiempo extra" };
  }
  if (tipos.has("tope_extra_semanal_excedido")) {
    return { tono: "critico", etiqueta: "Tope de tiempo extra superado" };
  }
  if (tipos.has("jornada_total_diaria_excedida") || tipos.has("tope_extra_diario_excedido")) {
    return { tono: "critico", etiqueta: "Tope diario superado" };
  }
  if (tipos.has("dias_extra_excedidos")) {
    return { tono: "alerta", etiqueta: "Demasiados días con tiempo extra" };
  }
  const tope = menorDeEdad ? vigentes.topeExtraSemanalMenorMin : vigentes.topeExtraSemanalMin;
  if (tope > 0 && extra >= tope * UMBRAL_CERCA_DEL_TOPE) {
    return { tono: "alerta", etiqueta: `Cerca del tope de ${String(tope / 60)} h extra` };
  }
  return {
    tono: "bien",
    etiqueta: extra > 0 ? "Con tiempo extra, dentro del tope" : "Dentro de topes",
  };
}

/** Lunes (AAAA-MM-DD) de la semana ISO que contiene la fecha dada. */
export function mondayOf(fecha: string): string {
  const date = new Date(`${fecha}T00:00:00Z`);
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return addDays(fecha, 1 - isoDay);
}

export function addDays(fecha: string, days: number): string {
  const date = new Date(`${fecha}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Día de la semana ISO (1 = lunes … 7 = domingo). */
export function isoWeekday(fecha: string): number {
  const day = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Fecha (AAAA-MM-DD) de un instante en una zona horaria IANA. */
export function dateInZone(instant: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Minutos de la jornada pactada entre dos horas HH:MM[:SS]; si la salida es menor, cruza la medianoche. */
export function scheduledMinutes(horaEntrada: string, horaSalida: string): number {
  const minutes = (hora: string) => {
    const [h = "0", m = "0"] = hora.split(":");
    return Number(h) * 60 + Number(m);
  };
  const diff = minutes(horaSalida) - minutes(horaEntrada);
  return diff >= 0 ? diff : diff + 24 * 60;
}
