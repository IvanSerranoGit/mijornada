// Estado de la cuenta de la empresa y bloqueo suave. Vive aparte de pagos.ts porque lo
// usan los manejadores de administración, que no deben depender de Stripe.
import type { Ctx } from "./context.ts";
import { ApiError, fromDatabase } from "./errors.ts";

export interface EstadoCuenta {
  plan: "prueba" | "basico" | "negocio" | "crecimiento";
  plan_ciclo: "mensual" | "anual" | null;
  prueba_hasta: string;
  plan_hasta: string | null;
  limite_personas: number;
  personas_activas: number;
  acceso: "completo" | "solo_lectura";
  motivo: "prueba_vencida" | "pago_fallido" | null;
  tiene_suscripcion: boolean;
  /** Cobro fallido sin regularizar; nulo si está al corriente. */
  pago_fallido_en: string | null;
  /** Hasta cuándo dura la gracia antes de pasar a solo lectura. */
  gracia_hasta: string | null;
}

function tenantDe(ctx: Ctx): string {
  if (ctx.sesion.tenantId === null) {
    throw new ApiError(409, "sin_empresa", "Tu cuenta todavía no tiene una empresa.");
  }
  return ctx.sesion.tenantId;
}

/** Plan, límite de personas y si la administración está en solo lectura. */
export async function getEstadoCuenta(ctx: Ctx): Promise<EstadoCuenta> {
  const { data, error } = await ctx.db
    .schema("tenants")
    .rpc("estado_de_cuenta", { p_tenant_id: tenantDe(ctx) });
  if (error) throw fromDatabase(error);
  const estado = data[0];
  if (estado === undefined) throw new ApiError(404, "no_encontrado", "La empresa no existe.");
  return estado as EstadoCuenta;
}

const MENSAJE_SOLO_LECTURA: Record<NonNullable<EstadoCuenta["motivo"]>, string> = {
  prueba_vencida:
    "Tu prueba gratuita terminó. Elige un plan para volver a administrar; tu equipo puede seguir marcando.",
  pago_fallido:
    "No pudimos cobrar tu plan. Actualiza tu forma de pago para volver a administrar; tu equipo puede seguir marcando.",
};

/**
 * Bloqueo suave: con la prueba vencida o un pago fallido, la administración (altas y
 * cambios de personas, centros, horarios, documentos, kioscos y usuarios) queda en solo
 * lectura. Nunca se llama desde el marcaje, el consentimiento, las incidencias ni los
 * reportes: el registro legal no se interrumpe y los datos no se ocultan.
 */
export async function requireCuentaActiva(ctx: Ctx): Promise<void> {
  if (ctx.sesion.tenantId === null) return;
  const estado = await getEstadoCuenta(ctx);
  if (estado.acceso === "solo_lectura" && estado.motivo !== null) {
    throw new ApiError(402, "solo_lectura", MENSAJE_SOLO_LECTURA[estado.motivo]);
  }
}
