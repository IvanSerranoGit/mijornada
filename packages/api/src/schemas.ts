// Contratos de la API /api/v1: la misma definición valida y documenta.
import { z } from "zod";

const uuid = z.uuid({ error: "Identificador inválido." });
const fecha = z.iso.date({ error: "La fecha debe ser AAAA-MM-DD." });
const instante = z.iso.datetime({ offset: true, error: "La hora debe ser ISO 8601." });
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "La hora debe ser HH:MM.");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "El hash debe ser SHA-256 en hexadecimal.");
const texto = (max: number) => z.string().trim().min(1, "Este campo es obligatorio.").max(max);

export const TAMANOS = ["micro", "pequena", "mediana", "grande"] as const;
export const JURISDICCIONES = ["federal", "local"] as const;
export const TIPOS_JORNADA = ["diurna", "mixta", "nocturna"] as const;
export const METODOS_MARCAJE_CENTRO = ["kiosco", "telefono", "ambos"] as const;
export const TIPOS_MARCAJE = ["entrada", "salida", "inicio_pausa", "fin_pausa"] as const;
export const ORIGENES_MARCAJE = ["pwa", "kiosco", "api"] as const;

const rfc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "El RFC no tiene un formato válido.");

export const paginacion = z.object({
  cursor: uuid.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------- empresas

export const empresaCrear = z.object({
  razon_social: texto(200),
  rfc: rfc.nullish(),
  tamano: z.enum(TAMANOS),
  sector: z.string().trim().max(120).nullish(),
  jurisdiccion: z.enum(JURISDICCIONES),
});

export const empresaActualizar = z
  .object({
    razon_social: texto(200),
    rfc: rfc.nullable(),
    tamano: z.enum(TAMANOS),
    sector: z.string().trim().max(120).nullable(),
    jurisdiccion: z.enum(JURISDICCIONES),
    zona_horaria: texto(64),
    onboarding_completado_en: instante.nullable(),
    // Datos que piden el convenio y el aviso de privacidad.
    domicilio: z.string().trim().min(5).max(300).nullable(),
    correo_privacidad: z.email("Escribe un correo válido.").max(200).nullable(),
    telefono_privacidad: z.string().trim().min(7).max(30).nullable(),
  })
  .partial();

// ---------------------------------------------------------------- centros

export const centroCrear = z.object({
  nombre: texto(120),
  direccion: z.string().trim().max(300).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radio_m: z.number().int().positive().max(100_000).nullish(),
  zona_horaria: texto(64).default("America/Mexico_City"),
});

export const centroActualizar = centroCrear
  .extend({
    metodo_marcaje: z.enum(METODOS_MARCAJE_CENTRO).nullable(),
    foto_en_kiosco: z.boolean(),
    foto_en_telefono: z.boolean(),
  })
  .partial();

// ---------------------------------------------------------------- trabajadores y horarios

const diasLaborables = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Elige al menos un día.")
  .max(7)
  .refine((dias) => new Set(dias).size === dias.length, "Los días no se repiten.");

export const horarioBase = z.object({
  dias: diasLaborables,
  hora_entrada: hora,
  hora_salida: hora,
  descanso_semanal: z.array(z.number().int().min(1).max(7)).max(7).default([7]),
});

export const horarioCrear = horarioBase.extend({
  trabajador_id: uuid,
  vigente_desde: fecha,
});

export const trabajadorCrear = z.object({
  centro_id: uuid,
  nombre: texto(160),
  puesto: z.string().trim().max(120).nullish(),
  menor_de_edad: z.boolean().default(false),
  tipo_jornada: z.enum(TIPOS_JORNADA).default("diurna"),
  curp: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/, "La CURP no tiene un formato válido.")
    .nullish(),
  nss: z
    .string()
    .trim()
    .regex(/^\d{11}$/, "El NSS son 11 dígitos.")
    .nullish(),
  horario: horarioBase.nullish(),
});

export const trabajadorActualizar = z
  .object({
    centro_id: uuid,
    nombre: texto(160),
    puesto: z.string().trim().max(120).nullable(),
    menor_de_edad: z.boolean(),
    tipo_jornada: z.enum(TIPOS_JORNADA),
    fecha_baja: fecha.nullable(),
  })
  .partial();

export const usuarioActualizar = z
  .object({
    rol: z.enum(["administrador", "supervisor", "empleado"]),
    centro_id: uuid.nullable(),
    activo: z.boolean(),
  })
  .partial();

// ---------------------------------------------------------------- eventos

/**
 * Lo que un dispositivo puede declarar cuando no manda foto. El estado final
 * (ok, no_disponible, sin_camara, no_requerida) lo fija la base al insertar.
 */
export const fotoEstadoDeclarado = z.enum(["no_disponible", "sin_camara"]);
/** Motivo técnico corto de por qué no hay foto (sin datos personales). */
export const fotoMotivo = z.string().trim().max(120);

export const eventoCrear = z.object({
  trabajador_id: uuid,
  client_event_id: uuid,
  tipo: z.enum(TIPOS_MARCAJE),
  origen: z.enum(ORIGENES_MARCAJE).default("pwa"),
  ts_dispositivo: instante,
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  precision_m: z.number().min(0).max(1_000_000).nullish(),
  foto_hash: sha256.nullish(),
  foto_url: z.string().max(500).nullish(),
  foto_estado: fotoEstadoDeclarado.optional(),
  foto_motivo: fotoMotivo.optional(),
  dispositivo_id: z.string().trim().max(120).nullish(),
});

/** POST /eventos acepta un evento o un lote. */
export const eventosCrear = z.union([
  eventoCrear,
  z.array(eventoCrear).min(1, "El lote está vacío.").max(100, "Máximo 100 eventos por lote."),
]);

export const rangoPorTrabajador = paginacion.extend({
  trabajador_id: uuid,
  desde: instante.optional(),
  hasta: instante.optional(),
});

export const diasPorTrabajador = z.object({
  trabajador_id: uuid,
  desde: fecha,
  hasta: fecha,
});

export const reglasPorFecha = z.object({
  fecha: fecha.optional(),
});

export type EmpresaCrear = z.infer<typeof empresaCrear>;
export type EmpresaActualizar = z.infer<typeof empresaActualizar>;
export type CentroCrear = z.infer<typeof centroCrear>;
export type CentroActualizar = z.infer<typeof centroActualizar>;
export type TrabajadorCrear = z.infer<typeof trabajadorCrear>;
export type TrabajadorActualizar = z.infer<typeof trabajadorActualizar>;
export type UsuarioActualizar = z.infer<typeof usuarioActualizar>;
export type HorarioCrear = z.infer<typeof horarioCrear>;
export type EventoCrear = z.infer<typeof eventoCrear>;
export type Paginacion = z.infer<typeof paginacion>;
