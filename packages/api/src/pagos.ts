// Planes y cobro con Stripe: catálogo, estado de la cuenta, checkout, portal de
// facturación y webhook. Detalle en docs/planes-y-cobro.md.
import Stripe from "stripe";
import { z } from "zod";
import type { Ctx, Db } from "./context.ts";
import { getEstadoCuenta, type EstadoCuenta } from "./cuenta.ts";
import { ApiError, fromDatabase } from "./errors.ts";
import { defined, requireTenant } from "./handlers.ts";

export const PLANES_PAGADOS = ["basico", "negocio", "crecimiento"] as const;
export type PlanPagado = (typeof PLANES_PAGADOS)[number];
export const CICLOS = ["mensual", "anual"] as const;
export type Ciclo = (typeof CICLOS)[number];

/** Precio por persona adicional al mes cuando el plan Crecimiento pasa de 60 personas. */
export const PRECIO_ASIENTO_MXN = 20;

/**
 * Catálogo de planes. Los precios son en pesos, con IVA incluido: es lo que ve el cliente
 * y lo que cobra Stripe (precios con impuesto incluido; la factura desglosa el IVA).
 * El anual cuesta diez meses: dos gratis.
 */
export const PLANES: Record<
  PlanPagado,
  { nombre: string; personas: number; mensual: number; anual: number; descripcion: string }
> = {
  basico: {
    nombre: "Básico",
    personas: 10,
    mensual: 299,
    anual: 2990,
    descripcion: "Para negocios de hasta 10 personas.",
  },
  negocio: {
    nombre: "Negocio",
    personas: 30,
    mensual: 599,
    anual: 5990,
    descripcion: "Para negocios de hasta 30 personas.",
  },
  crecimiento: {
    nombre: "Crecimiento",
    personas: 60,
    mensual: 999,
    anual: 9990,
    descripcion: "Hasta 60 personas; después, $20 por persona adicional al mes.",
  },
};

export const DIAS_DE_PRUEBA = 14;

/** Clave con la que se busca cada precio en Stripe (lookup_key). */
export const lookupKey = (plan: PlanPagado, ciclo: Ciclo) => `mijornada_${plan}_${ciclo}`;
export const LOOKUP_ASIENTO: Record<Ciclo, string> = {
  mensual: "mijornada_asiento_mensual",
  anual: "mijornada_asiento_anual",
};
/** Tasa de IVA (16 %, incluida en el precio) que se aplica a cada suscripción. */
export const IVA = { nombre: "IVA", porcentaje: 16, metadata: "mijornada_iva_16" };

export const checkoutCrear = z.object({ plan: z.enum(PLANES_PAGADOS), ciclo: z.enum(CICLOS) });

export const facturacionActualizar = z
  .object({
    rfc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, "El RFC no tiene el formato correcto.")
      .nullable(),
    regimen_fiscal: z.string().trim().min(3).max(120).nullable(),
    cp_fiscal: z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, "El código postal son 5 dígitos.")
      .nullable(),
    uso_cfdi: z.string().trim().min(2).max(120).nullable(),
  })
  .partial();

/** Días completos que le quedan a la prueba (0 si ya venció). */
export function diasDePrueba(
  estado: Pick<EstadoCuenta, "prueba_hasta">,
  ahora: Date = new Date(),
): number {
  const restante = new Date(estado.prueba_hasta).getTime() - ahora.getTime();
  return Math.max(0, Math.ceil(restante / 86_400_000));
}

/** Datos fiscales para la factura, que por ahora se emite a mano. */
export async function updateFacturacion(ctx: Ctx, input: z.infer<typeof facturacionActualizar>) {
  const { error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .update(defined(input))
    .eq("id", requireTenant(ctx));
  if (error) throw fromDatabase(error);
  return { guardado: true };
}

// ---------------------------------------------------------------- Stripe

/** Cliente de Stripe, o un error claro si el servidor no tiene la llave configurada. */
export function createStripe(secretKey: string | undefined): Stripe {
  if (!secretKey) {
    throw new ApiError(
      503,
      "pagos_no_disponibles",
      "El cobro todavía no está configurado en este entorno.",
    );
  }
  return new Stripe(secretKey);
}

async function precio(stripe: Stripe, clave: string): Promise<string> {
  const { data } = await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 });
  const encontrado = data[0];
  if (encontrado === undefined) {
    throw new ApiError(503, "pagos_no_disponibles", `Falta el precio ${clave} en Stripe.`);
  }
  return encontrado.id;
}

async function tasaIva(stripe: Stripe): Promise<string | null> {
  const { data } = await stripe.taxRates.list({ active: true, limit: 100 });
  return data.find((tasa) => tasa.metadata?.["clave"] === IVA.metadata)?.id ?? null;
}

/** Personas activas por encima de las 60 incluidas en Crecimiento. */
export const asientosAdicionales = (plan: PlanPagado, personas: number) =>
  plan === "crecimiento" ? Math.max(0, personas - PLANES.crecimiento.personas) : 0;

/**
 * Abre el Checkout de Stripe para suscribirse a un plan. Solo el dueño. Si la prueba
 * sigue vigente, el primer cobro se hace al terminar: no se pierden días.
 */
export async function createCheckout(
  ctx: Ctx,
  stripe: Stripe,
  input: z.infer<typeof checkoutCrear>,
  origin: string,
  ahora: Date = new Date(),
): Promise<{ url: string }> {
  const tenantId = requireTenant(ctx);
  if (ctx.sesion.rol !== "dueno") {
    throw new ApiError(403, "sin_permiso", "Solo el dueño puede contratar un plan.");
  }
  const estado = await getEstadoCuenta(ctx);
  if (estado.tiene_suscripcion) {
    throw new ApiError(
      409,
      "ya_suscrito",
      "Ya tienes un plan. Cámbialo desde el portal de facturación.",
    );
  }
  const { data: empresa, error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("razon_social, stripe_customer_id")
    .eq("id", tenantId)
    .single();
  if (error) throw fromDatabase(error);

  const [principal, iva] = await Promise.all([
    precio(stripe, lookupKey(input.plan, input.ciclo)),
    tasaIva(stripe),
  ]);
  const asientos = asientosAdicionales(input.plan, estado.personas_activas);
  const lineas: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: principal, quantity: 1 },
  ];
  if (asientos > 0) {
    lineas.push({ price: await precio(stripe, LOOKUP_ASIENTO[input.ciclo]), quantity: asientos });
  }

  // Stripe exige que la prueba termine al menos 48 horas después.
  const finPrueba = new Date(estado.prueba_hasta).getTime();
  const pruebaVigente = estado.plan === "prueba" && finPrueba - ahora.getTime() > 49 * 3_600_000;

  const sesion = await stripe.checkout.sessions.create({
    mode: "subscription",
    locale: "es-419",
    client_reference_id: tenantId,
    ...(empresa.stripe_customer_id
      ? { customer: empresa.stripe_customer_id }
      : { customer_creation: "always" as const }),
    line_items: lineas,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: { tenant_id: tenantId },
      ...(iva === null ? {} : { default_tax_rates: [iva] }),
      ...(pruebaVigente ? { trial_end: Math.floor(finPrueba / 1000) } : {}),
    },
    metadata: { tenant_id: tenantId },
    success_url: `${origin}/panel/plan?pago=listo`,
    cancel_url: `${origin}/panel/plan?pago=cancelado`,
  });
  if (!sesion.url)
    throw new ApiError(502, "pagos_no_disponibles", "Stripe no devolvió la página de pago.");
  return { url: sesion.url };
}

/** Portal de facturación de Stripe: cambiar de plan, de tarjeta o cancelar. Solo el dueño. */
export async function createPortal(
  ctx: Ctx,
  stripe: Stripe,
  origin: string,
): Promise<{ url: string }> {
  const tenantId = requireTenant(ctx);
  if (ctx.sesion.rol !== "dueno") {
    throw new ApiError(403, "sin_permiso", "Solo el dueño puede administrar la facturación.");
  }
  const { data: empresa, error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .single();
  if (error) throw fromDatabase(error);
  if (!empresa.stripe_customer_id) {
    throw new ApiError(409, "sin_suscripcion", "Todavía no has contratado un plan.");
  }
  const sesion = await stripe.billingPortal.sessions.create({
    customer: empresa.stripe_customer_id,
    return_url: `${origin}/panel/plan`,
    locale: "es-419",
  });
  return { url: sesion.url };
}

/** Lo que un evento de Stripe cambia en la empresa. Nulo en un campo: ese evento no lo dice. */
export interface CambioDePlan {
  tenantId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  plan: PlanPagado | null;
  ciclo: Ciclo | null;
  planHasta: string | null;
  pagoFallido: boolean | null;
}

const idDe = (valor: string | { id: string } | null | undefined): string | null =>
  valor == null ? null : typeof valor === "string" ? valor : valor.id;

/** Plan y ciclo a partir de la clave del precio principal de la suscripción. */
export function planDeLookupKey(
  clave: string | null | undefined,
): { plan: PlanPagado; ciclo: Ciclo } | null {
  const partes = /^mijornada_(basico|negocio|crecimiento)_(mensual|anual)$/.exec(clave ?? "");
  return partes ? { plan: partes[1] as PlanPagado, ciclo: partes[2] as Ciclo } : null;
}

function deSuscripcion(suscripcion: Stripe.Subscription): CambioDePlan {
  const principal = suscripcion.items.data
    .map((item) => ({ item, plan: planDeLookupKey(item.price.lookup_key) }))
    .find((candidato) => candidato.plan !== null);
  const fin = principal?.item.current_period_end;
  return {
    tenantId: suscripcion.metadata["tenant_id"] ?? null,
    customerId: idDe(suscripcion.customer),
    subscriptionId: suscripcion.id,
    plan: principal?.plan?.plan ?? null,
    ciclo: principal?.plan?.ciclo ?? null,
    planHasta: fin === undefined ? null : new Date(fin * 1000).toISOString(),
    // Al corriente (o en prueba) limpia el aviso; vencida o sin pagar lo enciende.
    pagoFallido:
      suscripcion.status === "active" || suscripcion.status === "trialing"
        ? false
        : suscripcion.status === "past_due" || suscripcion.status === "unpaid"
          ? true
          : null,
  };
}

/**
 * Traduce un evento de Stripe al cambio que produce en la empresa. Función pura: no llama
 * a Stripe ni a la base. Devuelve null si el evento no interesa.
 */
export function cambioDeEvento(evento: Stripe.Event): CambioDePlan | null {
  switch (evento.type) {
    case "checkout.session.completed": {
      const sesion = evento.data.object;
      if (sesion.mode !== "subscription") return null;
      return {
        tenantId: sesion.client_reference_id ?? sesion.metadata?.["tenant_id"] ?? null,
        customerId: idDe(sesion.customer),
        subscriptionId: idDe(sesion.subscription),
        plan: null,
        ciclo: null,
        planHasta: null,
        pagoFallido: null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return deSuscripcion(evento.data.object);
    case "invoice.payment_failed": {
      const factura = evento.data.object;
      return {
        tenantId: factura.parent?.subscription_details?.metadata?.["tenant_id"] ?? null,
        customerId: idDe(factura.customer),
        subscriptionId: idDe(factura.parent?.subscription_details?.subscription),
        plan: null,
        ciclo: null,
        planHasta: null,
        pagoFallido: true,
      };
    }
    default:
      return null;
  }
}

/** Comprueba la firma del webhook; lanza 400 si no es de Stripe. */
export function verificarWebhook(
  stripe: Stripe,
  cuerpo: string,
  firma: string | null,
  secreto: string | undefined,
) {
  if (!secreto)
    throw new ApiError(503, "pagos_no_disponibles", "Falta el secreto del webhook de Stripe.");
  try {
    return stripe.webhooks.constructEvent(cuerpo, firma ?? "", secreto);
  } catch {
    throw new ApiError(400, "firma_invalida", "La firma del webhook no es válida.");
  }
}

/**
 * Aplica un evento ya verificado. Corre con rol de servicio (es un job del servidor).
 * Es idempotente: Stripe puede entregar el mismo evento más de una vez.
 */
export async function aplicarEventoStripe(
  admin: Db,
  evento: Stripe.Event,
): Promise<{ aplicado: boolean; motivo?: string }> {
  const cambio = cambioDeEvento(evento);
  if (cambio === null) return { aplicado: false, motivo: "evento_ignorado" };
  if (cambio.tenantId === null && cambio.customerId === null) {
    return { aplicado: false, motivo: "sin_empresa" };
  }
  const { data, error } = await admin.schema("tenants").rpc("aplicar_evento_stripe", {
    p_evento_id: evento.id,
    p_tipo: evento.type,
    // Los tipos generados no admiten null en los argumentos de la función.
    p_tenant_id: cambio.tenantId as string,
    p_customer_id: cambio.customerId as string,
    p_subscription_id: cambio.subscriptionId as string,
    p_plan: cambio.plan as string,
    p_ciclo: cambio.ciclo as string,
    p_plan_hasta: cambio.planHasta as string,
    p_pago_fallido: cambio.pagoFallido as boolean,
  });
  if (error) {
    // Un evento de un cliente que no es de Mi Jornada no debe hacer que Stripe reintente.
    if (error.code === "P0002") return { aplicado: false, motivo: "sin_empresa" };
    throw fromDatabase(error);
  }
  return data ? { aplicado: true } : { aplicado: false, motivo: "duplicado" };
}

/**
 * Ajusta en Stripe las personas adicionales del plan Crecimiento a las activas hoy.
 * Corre en el servidor (cron diario) con rol de servicio.
 */
export async function sincronizarAsientos(
  admin: Db,
  stripe: Stripe,
): Promise<{ ajustadas: number }> {
  const { data: empresas, error } = await admin
    .schema("tenants")
    .from("empresa")
    .select("id, plan_ciclo, stripe_subscription_id")
    .eq("plan", "crecimiento")
    .not("stripe_subscription_id", "is", null);
  if (error) throw fromDatabase(error);

  let ajustadas = 0;
  for (const empresa of empresas) {
    const { count } = await admin
      .schema("tenants")
      .from("trabajador")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", empresa.id)
      .is("fecha_baja", null);
    const necesarios = asientosAdicionales("crecimiento", count ?? 0);
    const suscripcion = await stripe.subscriptions.retrieve(empresa.stripe_subscription_id);
    const ciclo: Ciclo = empresa.plan_ciclo === "anual" ? "anual" : "mensual";
    const actual = suscripcion.items.data.find(
      (item) => item.price.lookup_key === LOOKUP_ASIENTO[ciclo],
    );
    if ((actual?.quantity ?? 0) === necesarios) continue;

    if (actual === undefined) {
      await stripe.subscriptionItems.create({
        subscription: suscripcion.id,
        price: await precio(stripe, LOOKUP_ASIENTO[ciclo]),
        quantity: necesarios,
      });
    } else if (necesarios === 0) {
      await stripe.subscriptionItems.del(actual.id);
    } else {
      await stripe.subscriptionItems.update(actual.id, { quantity: necesarios });
    }
    ajustadas += 1;
  }
  return { ajustadas };
}
