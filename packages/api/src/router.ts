// Tabla de rutas de /api/v1 y adaptador HTTP. No depende de Next: trabaja con
// Request y Response estándar, así que cualquier app puede montarla.
import { z } from "zod";
import type { Ctx } from "./context.ts";
import { ApiError, fromDatabase, noAutenticado } from "./errors.ts";
import * as h from "./handlers.ts";
import * as s from "./schemas.ts";

type Metodo = "GET" | "POST" | "PATCH";

interface Entrada {
  params: Record<string, string>;
  query: unknown;
  body: unknown;
}

export interface Ruta {
  metodo: Metodo;
  /** Ruta relativa a /api/v1, con parámetros entre llaves. */
  ruta: string;
  resumen: string;
  etiqueta: string;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Código de respuesta cuando todo sale bien (200 por defecto). */
  status?: number;
  handler: (ctx: Ctx, entrada: Entrada) => Promise<unknown>;
}

const id = z.uuid({ error: "Identificador inválido." });

/** Construye una ruta infiriendo los tipos de query y body desde sus esquemas. */
function ruta<Q extends z.ZodType = z.ZodUnknown, B extends z.ZodType = z.ZodUnknown>(def: {
  metodo: Metodo;
  ruta: string;
  resumen: string;
  etiqueta: string;
  query?: Q;
  body?: B;
  status?: number;
  handler: (
    ctx: Ctx,
    entrada: { params: Record<string, string>; query: z.infer<Q>; body: z.infer<B> },
  ) => Promise<unknown>;
}): Ruta {
  return def as Ruta;
}

const param = (params: Record<string, string>, name: string): string => id.parse(params[name]);

export const RUTAS: Ruta[] = [
  ruta({
    metodo: "GET",
    ruta: "/empresas",
    etiqueta: "Empresas",
    resumen: "Empresas a las que tiene acceso quien llama.",
    handler: (ctx) => h.listEmpresas(ctx),
  }),
  ruta({
    metodo: "POST",
    ruta: "/empresas",
    etiqueta: "Empresas",
    resumen:
      "Da de alta la empresa y a quien llama como dueño. Después hay que refrescar la sesión.",
    body: s.empresaCrear,
    status: 201,
    handler: (ctx, { body }) => h.createEmpresa(ctx, body),
  }),
  ruta({
    metodo: "GET",
    ruta: "/empresas/{id}",
    etiqueta: "Empresas",
    resumen: "Una empresa.",
    handler: (ctx, { params }) => h.getEmpresa(ctx, param(params, "id")),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/empresas/{id}",
    etiqueta: "Empresas",
    resumen: "Actualiza datos de la empresa.",
    body: s.empresaActualizar,
    handler: (ctx, { params, body }) => h.updateEmpresa(ctx, param(params, "id"), body),
  }),

  ruta({
    metodo: "GET",
    ruta: "/centros",
    etiqueta: "Centros",
    resumen: "Centros de trabajo.",
    handler: (ctx) => h.listCentros(ctx),
  }),
  ruta({
    metodo: "POST",
    ruta: "/centros",
    etiqueta: "Centros",
    resumen: "Crea un centro de trabajo.",
    body: s.centroCrear,
    status: 201,
    handler: (ctx, { body }) => h.createCentro(ctx, body),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/centros/{id}",
    etiqueta: "Centros",
    resumen: "Actualiza un centro, incluido su método de marcaje.",
    body: s.centroActualizar,
    handler: (ctx, { params, body }) => h.updateCentro(ctx, param(params, "id"), body),
  }),
  ruta({
    metodo: "POST",
    ruta: "/centros/{id}/codigo-enlace",
    etiqueta: "Centros",
    resumen: "Da de alta una tablet de kiosco y devuelve su código de enlace de un solo uso.",
    body: z.object({ nombre: z.string().trim().max(80).optional() }).optional(),
    status: 201,
    handler: (ctx, { params, body }) =>
      h.createCodigoEnlace(ctx, param(params, "id"), body?.nombre),
  }),

  ruta({
    metodo: "GET",
    ruta: "/usuarios",
    etiqueta: "Usuarios",
    resumen: "Usuarios del tenant.",
    handler: (ctx) => h.listUsuarios(ctx),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/usuarios/{id}",
    etiqueta: "Usuarios",
    resumen: "Cambia el rol, el centro o el estado de un usuario.",
    body: s.usuarioActualizar,
    handler: (ctx, { params, body }) => h.updateUsuario(ctx, param(params, "id"), body),
  }),

  ruta({
    metodo: "GET",
    ruta: "/trabajadores",
    etiqueta: "Trabajadores",
    resumen: "Trabajadores, paginados por cursor.",
    query: s.paginacion.extend({ centro_id: id.optional() }),
    handler: (ctx, { query }) => h.listTrabajadores(ctx, query, query.centro_id),
  }),
  ruta({
    metodo: "POST",
    ruta: "/trabajadores",
    etiqueta: "Trabajadores",
    resumen: "Alta de trabajador. Devuelve su PIN y el token de su QR en claro, por única vez.",
    body: s.trabajadorCrear,
    status: 201,
    handler: (ctx, { body }) => h.createTrabajador(ctx, body),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/trabajadores/{id}",
    etiqueta: "Trabajadores",
    resumen: "Actualiza un trabajador; la baja es una fecha, nunca un borrado.",
    body: s.trabajadorActualizar,
    handler: (ctx, { params, body }) => h.updateTrabajador(ctx, param(params, "id"), body),
  }),
  ruta({
    metodo: "POST",
    ruta: "/trabajadores/{id}/credenciales",
    etiqueta: "Trabajadores",
    resumen: "Genera un PIN y un QR nuevos; los anteriores dejan de servir.",
    status: 201,
    handler: (ctx, { params }) => h.regenerateCredenciales(ctx, param(params, "id")),
  }),

  ruta({
    metodo: "GET",
    ruta: "/horarios",
    etiqueta: "Horarios",
    resumen: "Historial de horarios de un trabajador.",
    query: z.object({ trabajador_id: id }),
    handler: (ctx, { query }) => h.listHorarios(ctx, query.trabajador_id),
  }),
  ruta({
    metodo: "POST",
    ruta: "/horarios",
    etiqueta: "Horarios",
    resumen: "Crea una versión nueva del horario y cierra la anterior.",
    body: s.horarioCrear,
    status: 201,
    handler: (ctx, { body }) => h.createHorario(ctx, body),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/horarios",
    etiqueta: "Horarios",
    resumen: "Igual que POST: un horario nunca se edita, cada cambio es una versión nueva.",
    body: s.horarioCrear,
    status: 201,
    handler: (ctx, { body }) => h.createHorario(ctx, body),
  }),

  ruta({
    metodo: "POST",
    ruta: "/eventos",
    etiqueta: "Eventos",
    resumen:
      "Registra uno o varios marcajes. Idempotente por client_event_id: la respuesta dice, por elemento, si se insertó o ya existía.",
    body: s.eventosCrear,
    handler: async (ctx, { body }) => ({ resultados: await h.createEventos(ctx, body) }),
  }),
  ruta({
    metodo: "GET",
    ruta: "/eventos",
    etiqueta: "Eventos",
    resumen: "Eventos de un trabajador en un rango, paginados por cursor.",
    query: s.rangoPorTrabajador,
    handler: (ctx, { query }) => h.listEventos(ctx, query),
  }),

  ruta({
    metodo: "GET",
    ruta: "/dias",
    etiqueta: "Días",
    resumen: "Días laborales (derivados) de un trabajador entre dos fechas.",
    query: s.diasPorTrabajador,
    handler: (ctx, { query }) => h.listDias(ctx, query),
  }),
  ruta({
    metodo: "GET",
    ruta: "/reglas",
    etiqueta: "Reglas",
    resumen: "Reglas vigentes en una fecha (por defecto, hoy).",
    query: s.reglasPorFecha,
    handler: (ctx, { query }) => h.listReglas(ctx, query.fecha),
  }),
];

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of parts.entries()) {
    const segment = segments[index] ?? "";
    if (part.startsWith("{")) {
      params[part.slice(1, -1)] = segment;
    } else if (part !== segment) {
      return null;
    }
  }
  return params;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(error.status, { codigo: error.codigo, mensaje: error.message });
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const campo = issue?.path.join(".");
    return json(422, {
      codigo: "datos_invalidos",
      mensaje: issue
        ? campo
          ? `${campo}: ${issue.message}`
          : issue.message
        : "Los datos no son válidos.",
    });
  }
  console.error(error);
  return json(500, {
    codigo: "error_interno",
    mensaje: "Ocurrió un error inesperado. Intenta de nuevo.",
  });
}

export interface HandleOptions {
  /** Contexto de quien llama, o null si no hay sesión válida. */
  getCtx: () => Promise<Ctx | null>;
  /** Peticiones por minuto y por tenant. */
  limitePorMinuto?: number;
}

/** Atiende una petición a /api/v1/<segments>. */
export async function handleRequest(
  request: Request,
  segments: string[],
  options: HandleOptions,
): Promise<Response> {
  try {
    const candidatas = RUTAS.map((r) => ({ r, params: match(r.ruta, segments) })).filter(
      (c): c is { r: Ruta; params: Record<string, string> } => c.params !== null,
    );
    if (candidatas.length === 0) {
      throw new ApiError(404, "ruta_no_encontrada", "La ruta no existe en /api/v1.");
    }
    const encontrada = candidatas.find((c) => c.r.metodo === request.method);
    if (encontrada === undefined) {
      throw new ApiError(405, "metodo_no_permitido", `Esta ruta no acepta ${request.method}.`);
    }

    const ctx = await options.getCtx();
    if (ctx === null) throw noAutenticado();

    const { data: permitido, error: limiteError } = await ctx.db
      .schema("tenants")
      .rpc("consumir_limite_api", { p_max: options.limitePorMinuto ?? 600, p_ventana_seg: 60 });
    if (limiteError) throw fromDatabase(limiteError);
    if (!permitido) {
      throw new ApiError(
        429,
        "demasiadas_peticiones",
        "Demasiadas peticiones. Espera un minuto e intenta de nuevo.",
      );
    }

    const { r, params } = encontrada;
    const query = r.query
      ? r.query.parse(Object.fromEntries(new URL(request.url).searchParams))
      : undefined;
    let body: unknown;
    if (r.body) {
      const raw = await request.text();
      let parsed: unknown;
      try {
        parsed = raw === "" ? undefined : JSON.parse(raw);
      } catch {
        throw new ApiError(400, "json_invalido", "El cuerpo de la petición no es JSON válido.");
      }
      body = r.body.parse(parsed);
    }

    return json(r.status ?? 200, await r.handler(ctx, { params, query, body }));
  } catch (error) {
    return errorResponse(error);
  }
}
