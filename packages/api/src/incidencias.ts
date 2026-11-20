// Incidencias y correcciones: nadie edita una marca. Se abre una incidencia, alguien con
// autoridad la resuelve y, si se aprueba, la base inserta el evento que corresponde.
// Detalle en docs/incidencias.md.
import { z } from "zod";
import type { Ctx } from "./context.ts";
import { ApiError, fromDatabase } from "./errors.ts";
import { requireTenant } from "./handlers.ts";

export const TIPOS_INCIDENCIA = [
  "olvido",
  "correccion_hora",
  "permiso",
  "home_office",
  "falta_justificada",
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number];

export const TITULO_INCIDENCIA: Record<TipoIncidencia, string> = {
  olvido: "Olvidé marcar",
  correccion_hora: "Corregir la hora de una marca",
  permiso: "Permiso",
  home_office: "Trabajo desde casa",
  falta_justificada: "Falta justificada",
};

const fecha = z.iso.date({ error: "Fecha inválida." });

export const incidenciaCrear = z
  .object({
    trabajador_id: z.uuid(),
    fecha,
    tipo: z.enum(TIPOS_INCIDENCIA),
    motivo: z.string().trim().min(3, "Explica el motivo.").max(500),
    /** Hora local del centro (HH:MM) que corresponde a la marca. */
    hora: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.")
      .optional(),
    /** Qué marca faltó (olvido). */
    tipo_marcaje: z.enum(["entrada", "salida", "inicio_pausa", "fin_pausa"]).optional(),
    /** Marca que se corrige (correccion_hora). */
    evento_referido_id: z.uuid().optional(),
  })
  .refine((i) => !["olvido", "correccion_hora"].includes(i.tipo) || i.hora !== undefined, {
    message: "Indica la hora que corresponde.",
    path: ["hora"],
  });
export type IncidenciaCrear = z.infer<typeof incidenciaCrear>;

export const incidenciaResolver = z.object({ aprobar: z.boolean() });
export const incidenciaResponder = z
  .object({ conforme: z.boolean(), comentario: z.string().trim().max(500).optional() })
  .refine((r) => r.conforme || (r.comentario ?? "") !== "", {
    message: "Explica por qué no estás de acuerdo.",
    path: ["comentario"],
  });

export const incidenciasFiltro = z.object({
  estado: z.enum(["pendiente", "aprobada", "rechazada"]).optional(),
  centro_id: z.uuid().optional(),
  trabajador_id: z.uuid().optional(),
});
export type IncidenciasFiltro = z.infer<typeof incidenciasFiltro>;

export const detalleDias = z.object({ trabajador_id: z.uuid(), desde: fecha, hasta: fecha });

const COLUMNS =
  "id, tenant_id, trabajador_id, fecha, tipo, estado, motivo, solicitado_por, resuelto_por, resuelto_en, evento_resultante_id, evento_referido_id, tipo_marcaje, ts_declarado, aceptada_en, inconforme_en, comentario_trabajador, extemporanea, creado_en";

/** Abre una incidencia. La hora se interpreta en la zona horaria del centro de la persona. */
export async function createIncidencia(ctx: Ctx, input: IncidenciaCrear) {
  const { data, error } = await ctx.db.schema("cumplimiento").rpc("abrir_incidencia", {
    p_trabajador_id: input.trabajador_id,
    p_fecha: input.fecha,
    p_tipo: input.tipo,
    p_motivo: input.motivo,
    ...(input.hora === undefined ? {} : { p_hora: input.hora }),
    ...(input.tipo_marcaje === undefined ? {} : { p_tipo_marcaje: input.tipo_marcaje }),
    ...(input.evento_referido_id === undefined
      ? {}
      : { p_evento_referido_id: input.evento_referido_id }),
  });
  if (error) throw fromDatabase(error);
  return data;
}

export interface IncidenciaListada {
  id: string;
  trabajador_id: string;
  trabajador: string;
  centro_id: string;
  fecha: string;
  tipo: string;
  estado: string;
  motivo: string;
  tipo_marcaje: string | null;
  ts_declarado: string | null;
  /** Hora de la marca que se pide corregir, si aplica. */
  hora_original: string | null;
  /** La abrió la propia persona (nace con su conformidad). */
  abierta_por_trabajador: boolean;
  conformidad: "conforme" | "inconforme" | "sin_respuesta";
  comentario_trabajador: string | null;
  extemporanea: boolean;
  resuelto_en: string | null;
  creado_en: string;
}

/** Incidencias visibles para quien llama (RLS), de la más reciente a la más antigua. */
export async function listIncidencias(
  ctx: Ctx,
  filtro: IncidenciasFiltro = {},
): Promise<IncidenciaListada[]> {
  const tenantId = requireTenant(ctx);
  let query = ctx.db
    .schema("cumplimiento")
    .from("incidencia")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("creado_en", { ascending: false })
    .limit(200);
  if (filtro.estado !== undefined) query = query.eq("estado", filtro.estado);
  if (filtro.trabajador_id !== undefined) query = query.eq("trabajador_id", filtro.trabajador_id);
  const { data, error } = await query;
  if (error) throw fromDatabase(error);
  if (data.length === 0) return [];

  const [trabajadores, usuarios, referidos] = await Promise.all([
    ctx.db
      .schema("tenants")
      .from("trabajador")
      .select("id, nombre, centro_id")
      .in("id", [...new Set(data.map((i) => i.trabajador_id))]),
    ctx.db
      .schema("tenants")
      .from("usuario")
      .select("id, trabajador_id")
      .in("id", [...new Set(data.map((i) => i.solicitado_por))]),
    ctx.db
      .schema("jornada")
      .from("evento")
      .select("id, ts_servidor, ts_dispositivo")
      .in("id", [
        ...new Set(data.flatMap((i) => (i.evento_referido_id ? [i.evento_referido_id] : []))),
      ]),
  ]);
  for (const result of [trabajadores, usuarios, referidos]) {
    if (result.error) throw fromDatabase(result.error);
  }

  return data
    .map((i): IncidenciaListada | null => {
      const trabajador = trabajadores.data?.find((t) => t.id === i.trabajador_id);
      if (trabajador === undefined) return null;
      const referido = referidos.data?.find((e) => e.id === i.evento_referido_id);
      return {
        id: i.id,
        trabajador_id: i.trabajador_id,
        trabajador: trabajador.nombre,
        centro_id: trabajador.centro_id,
        fecha: i.fecha,
        tipo: i.tipo,
        estado: i.estado,
        motivo: i.motivo,
        tipo_marcaje: i.tipo_marcaje,
        ts_declarado: i.ts_declarado,
        hora_original: referido ? (referido.ts_dispositivo ?? referido.ts_servidor) : null,
        abierta_por_trabajador:
          usuarios.data?.find((u) => u.id === i.solicitado_por)?.trabajador_id === i.trabajador_id,
        conformidad:
          i.aceptada_en !== null
            ? "conforme"
            : i.inconforme_en !== null
              ? "inconforme"
              : "sin_respuesta",
        comentario_trabajador: i.comentario_trabajador,
        extemporanea: i.extemporanea,
        resuelto_en: i.resuelto_en,
        creado_en: i.creado_en,
      };
    })
    .filter((i): i is IncidenciaListada => i !== null)
    .filter((i) => filtro.centro_id === undefined || i.centro_id === filtro.centro_id);
}

/** Aprueba o rechaza. Al aprobar, la base inserta el evento (corrección, marcaje o aprobación). */
export async function resolveIncidencia(ctx: Ctx, id: string, aprobar: boolean) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .rpc("resolver_incidencia", { p_incidencia_id: id, p_aprobar: aprobar });
  if (error) throw fromDatabase(error);
  return { evento_id: data };
}

/** El trabajador manifiesta su conformidad o inconformidad con una incidencia que abrió el patrón. */
export async function respondIncidencia(
  ctx: Ctx,
  id: string,
  input: { conforme: boolean; comentario?: string | undefined },
) {
  const { data, error } = await ctx.db.schema("cumplimiento").rpc("responder_incidencia", {
    p_incidencia_id: id,
    p_conforme: input.conforme,
    ...(input.comentario === undefined ? {} : { p_comentario: input.comentario }),
  });
  if (error) throw fromDatabase(error);
  return { respondida_en: data };
}

/** Una fila de jornada.detalle_marcajes. Los tipos generados no saben qué columnas pueden ser nulas. */
export interface MarcajeDetalle {
  evento_id: string;
  fecha: string;
  tipo: string;
  /** Nula si el marcaje nació de una incidencia por olvido. */
  hora_original: string | null;
  hora_vigente: string;
  ts_servidor: string;
  origen: string;
  foto_estado: string | null;
  fuera_de_geocerca: boolean | null;
  anulado: boolean;
  /** Evento que lleva la hora declarada; nulo si la marca no se corrigió. */
  correccion_evento_id: string | null;
  correccion_motivo: string | null;
  correccion_autorizo: string | null;
  correccion_registrada_en: string | null;
  incidencia_id: string | null;
  incidencia_tipo: string | null;
  solicitada_por: string | null;
  conformidad: "conforme" | "inconforme" | "sin_respuesta" | null;
  conformidad_en: string | null;
  comentario_trabajador: string | null;
  extemporanea: boolean;
}

/**
 * Marcajes de una persona entre dos fechas con su hora original, la vigente y, si hubo
 * corrección, el motivo, quién la autorizó, cuándo y la conformidad del trabajador.
 */
export async function getDetalleMarcajes(
  ctx: Ctx,
  params: { trabajador_id: string; desde: string; hasta: string },
): Promise<MarcajeDetalle[]> {
  if (params.hasta < params.desde) {
    throw new ApiError(422, "datos_invalidos", "El rango de fechas está al revés.");
  }
  const { data, error } = await ctx.db.schema("jornada").rpc("detalle_marcajes", {
    p_tenant_id: requireTenant(ctx),
    p_trabajador_id: params.trabajador_id,
    p_desde: params.desde,
    p_hasta: params.hasta,
  });
  if (error) throw fromDatabase(error);
  return data as MarcajeDetalle[];
}
