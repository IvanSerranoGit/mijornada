// Tabla de rutas de /api/v1 y adaptador HTTP. No depende de Next: trabaja con
// Request y Response estándar, así que cualquier app puede montarla.
import { z } from "zod";
import type { Ctx } from "./context.ts";
import { getEstadoCuenta } from "./cuenta.ts";
import { ApiError, errorResponseFrom, fromDatabase, noAutenticado } from "./errors.ts";
import * as d from "./documentos.ts";
import * as h from "./handlers.ts";
import * as i from "./incidencias.ts";
import * as p from "./pagos.ts";
import * as r from "./reportes.ts";
import * as s from "./schemas.ts";

type Metodo = "GET" | "POST" | "PATCH";

/** Datos de la petición que no vienen del cliente como datos: los deriva el servidor. */
export interface Meta {
  /** IP y navegador de quien llama (evidencia de las aceptaciones). */
  origen: d.Origen;
  /** Origen público del sitio (`https://mijornada.xyz`), para armar enlaces. */
  origin: string;
  /** PDF, QR y cliente de servicio que aporta el servidor que monta la API. */
  servicios: r.Servicios;
}

interface Entrada {
  params: Record<string, string>;
  query: unknown;
  body: unknown;
  meta: Meta;
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
    entrada: { params: Record<string, string>; query: z.infer<Q>; body: z.infer<B>; meta: Meta },
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
    metodo: "POST",
    ruta: "/centros/{id}/pin-admin",
    etiqueta: "Centros",
    resumen:
      "Genera un PIN de administrador del kiosco nuevo (para desvincular tablets); el anterior deja de servir.",
    status: 201,
    handler: (ctx, { params }) => h.createPinAdmin(ctx, param(params, "id")),
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
  ruta({
    metodo: "GET",
    ruta: "/documentos",
    etiqueta: "Documentos",
    resumen: "Versiones del convenio de registro y del aviso de privacidad de la empresa.",
    handler: (ctx) => d.listDocumentos(ctx),
  }),
  ruta({
    metodo: "POST",
    ruta: "/documentos",
    etiqueta: "Documentos",
    resumen:
      "Publica una versión nueva de un documento (con texto propio o con la plantilla de Mi Jornada). Deja pendientes los consentimientos.",
    body: d.documentoPublicar,
    status: 201,
    handler: (ctx, { body }) => d.publishDocumento(ctx, body),
  }),
  ruta({
    metodo: "GET",
    ruta: "/documentos/mios",
    etiqueta: "Documentos",
    resumen:
      "Documentos vigentes del trabajador que llama, listos para leer, con su estado de aceptación.",
    handler: (ctx, { meta }) => d.getMisDocumentos(ctx, meta.origin),
  }),
  ruta({
    metodo: "POST",
    ruta: "/documentos/{id}/aceptacion",
    etiqueta: "Documentos",
    resumen: "Firma simple: el trabajador acepta la versión vigente tecleando su nombre completo.",
    body: d.documentoAceptar,
    status: 201,
    handler: (ctx, { params, body, meta }) =>
      d.acceptDocumento(ctx, param(params, "id"), body.nombre, meta.origen),
  }),
  ruta({
    metodo: "GET",
    ruta: "/incidencias",
    etiqueta: "Incidencias",
    resumen: "Incidencias visibles para quien llama, con filtros por estado, centro y persona.",
    query: i.incidenciasFiltro,
    handler: (ctx, { query }) => i.listIncidencias(ctx, query),
  }),
  ruta({
    metodo: "POST",
    ruta: "/incidencias",
    etiqueta: "Incidencias",
    resumen:
      "Abre una incidencia (olvido, corrección de hora, permiso, trabajo desde casa o falta justificada).",
    body: i.incidenciaCrear,
    status: 201,
    handler: (ctx, { body }) => i.createIncidencia(ctx, body),
  }),
  ruta({
    metodo: "POST",
    ruta: "/incidencias/{id}/resolucion",
    etiqueta: "Incidencias",
    resumen: "Aprueba o rechaza una incidencia. Al aprobar se inserta el evento que corresponde.",
    body: i.incidenciaResolver,
    handler: (ctx, { params, body }) => i.resolveIncidencia(ctx, param(params, "id"), body.aprobar),
  }),
  ruta({
    metodo: "POST",
    ruta: "/incidencias/{id}/respuesta",
    etiqueta: "Incidencias",
    resumen: "El trabajador manifiesta su conformidad o inconformidad con una incidencia.",
    body: i.incidenciaResponder,
    handler: (ctx, { params, body }) => i.respondIncidencia(ctx, param(params, "id"), body),
  }),
  ruta({
    metodo: "GET",
    ruta: "/marcajes",
    etiqueta: "Días",
    resumen:
      "Marcajes de una persona entre dos fechas: hora original, hora vigente, corrección y conformidad.",
    query: i.detalleDias,
    handler: (ctx, { query }) => i.getDetalleMarcajes(ctx, query),
  }),
  ruta({
    metodo: "GET",
    ruta: "/cuenta",
    etiqueta: "Cuenta",
    resumen: "Plan, límite de personas y si la administración está en solo lectura.",
    handler: (ctx) => getEstadoCuenta(ctx),
  }),
  ruta({
    metodo: "PATCH",
    ruta: "/cuenta/facturacion",
    etiqueta: "Cuenta",
    resumen: "Datos fiscales para la factura (RFC, régimen, código postal y uso de CFDI).",
    body: p.facturacionActualizar,
    handler: (ctx, { body }) => p.updateFacturacion(ctx, body),
  }),
  ruta({
    metodo: "POST",
    ruta: "/cuenta/checkout",
    etiqueta: "Cuenta",
    resumen: "Abre el Checkout de Stripe para contratar un plan. Devuelve la URL de pago.",
    body: p.checkoutCrear,
    status: 201,
    handler: (ctx, { body, meta }) =>
      p.createCheckout(ctx, meta.servicios.stripe(), body, meta.origin),
  }),
  ruta({
    metodo: "POST",
    ruta: "/cuenta/portal",
    etiqueta: "Cuenta",
    resumen: "Abre el portal de facturación de Stripe (cambiar plan o tarjeta). Devuelve la URL.",
    status: 201,
    handler: (ctx, { meta }) => p.createPortal(ctx, meta.servicios.stripe(), meta.origin),
  }),
  ruta({
    metodo: "GET",
    ruta: "/reportes",
    etiqueta: "Reportes",
    resumen: "Reportes generados, del más reciente al más antiguo.",
    handler: (ctx) => r.listReportes(ctx),
  }),
  ruta({
    metodo: "POST",
    ruta: "/reportes",
    etiqueta: "Reportes",
    resumen:
      "Genera un reporte (inspección, periodo o trabajador): PDF y CSV en el bucket reportes, con sus huellas.",
    body: r.reporteCrear,
    status: 201,
    handler: (ctx, { body, meta }) => r.createReporte(ctx, body, meta.servicios, meta.origin),
  }),
  ruta({
    metodo: "GET",
    ruta: "/reportes/{id}/verificacion",
    etiqueta: "Reportes",
    resumen: "Verifica la cadena de hashes de cada persona del reporte en su periodo.",
    handler: (ctx, { params }) => r.verifyReporte(ctx, param(params, "id")),
  }),
  ruta({
    metodo: "GET",
    ruta: "/reportes/{id}/accesos",
    etiqueta: "Reportes",
    resumen: "Accesos de inspector de un reporte.",
    handler: (ctx, { params }) => r.listAccesosInspector(ctx, param(params, "id")),
  }),
  ruta({
    metodo: "POST",
    ruta: "/reportes/{id}/accesos",
    etiqueta: "Reportes",
    resumen:
      "Crea un enlace temporal de inspector (72 h, revocable). El enlace solo se muestra una vez.",
    status: 201,
    handler: (ctx, { params, meta }) =>
      r.createAccesoInspector(ctx, param(params, "id"), meta.servicios, meta.origin),
  }),
  ruta({
    metodo: "GET",
    ruta: "/reportes/{id}/consultas",
    etiqueta: "Reportes",
    resumen: "Consultas y descargas del inspector sobre un reporte, con IP y hora.",
    handler: (ctx, { params }) => r.listConsultasInspector(ctx, param(params, "id")),
  }),
  ruta({
    metodo: "POST",
    ruta: "/accesos-inspector/{id}/revocacion",
    etiqueta: "Reportes",
    resumen: "Revoca un acceso de inspector.",
    handler: (ctx, { params }) => r.revokeAccesoInspector(ctx, param(params, "id")),
  }),
  ruta({
    metodo: "GET",
    ruta: "/consentimientos",
    etiqueta: "Documentos",
    resumen:
      "Estado del consentimiento de cada trabajador activo frente a los documentos vigentes.",
    handler: (ctx) => d.listConsentimientos(ctx),
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

export const errorResponse = errorResponseFrom;

const sinServicio = (): never => {
  throw new ApiError(501, "no_disponible", "Este servidor no puede generar reportes.");
};
const SIN_SERVICIOS: r.Servicios = {
  pdf: sinServicio,
  qr: sinServicio,
  admin: sinServicio,
  stripe: () => p.createStripe(undefined),
};

export interface HandleOptions {
  /** Contexto de quien llama, o null si no hay sesión válida. */
  getCtx: () => Promise<Ctx | null>;
  /** Peticiones por minuto y por tenant. */
  limitePorMinuto?: number;
  /** Origen público del sitio; por defecto, el de la petición. */
  origin?: string;
  /** PDF, QR y cliente de servicio. Sin ellos, las rutas que los necesitan responden 501. */
  servicios?: r.Servicios;
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

    const meta: Meta = {
      origen: d.origenDe(request.headers),
      origin: options.origin ?? new URL(request.url).origin,
      servicios: options.servicios ?? SIN_SERVICIOS,
    };
    return json(r.status ?? 200, await r.handler(ctx, { params, query, body, meta }));
  } catch (error) {
    return errorResponse(error);
  }
}
