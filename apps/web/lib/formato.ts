// Formato de fechas y horas para las pantallas. Las horas siempre se muestran en la
// zona horaria del centro de trabajo, no en la del navegador.

export function hora(instante: string | Date, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instante));
}

/** Fecha de calendario (AAAA-MM-DD) en texto, sin corrimientos por zona horaria. */
export function fechaCorta(dia: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dia.slice(0, 10)}T00:00:00Z`));
}

export function fechaHora(instante: string | Date, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instante));
}

export const TIPOS_MARCAJE: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};

export const MEDIOS: Record<string, string> = {
  pwa: "Celular",
  kiosco: "Kiosco",
  api: "API",
  import: "Importado",
  incidencia: "Incidencia",
  sincronizacion_tardia: "Llegó tarde por falta de red",
};
