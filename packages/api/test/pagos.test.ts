// Planes y cobro: firma del webhook, transiciones de plan, límites y bloqueo suave.
// No se llama a Stripe: los eventos se arman aquí y se firman con un secreto de prueba.
import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import {
  aplicarEventoStripe,
  asientosAdicionales,
  cambioDeEvento,
  createStripe,
  diasDePrueba,
  planDeLookupKey,
  requireCuentaActiva,
  verificarWebhook,
  type EstadoCuenta,
} from "../src/index.ts";
import { admin, createEmpresa, createMember, unique, type Actor, type Empresa } from "./helpers.ts";

const SECRETO = "whsec_prueba_local";
const stripe = new Stripe("sk_test_local_sin_red");

let empresa: Empresa;
let empleado: Actor;
const cliente = `cus_${unique()}`;
const suscripcion = `sub_${unique()}`;

beforeAll(async () => {
  empresa = await createEmpresa();
  empleado = await createMember(empresa, "empleado");
}, 60_000);

/** Evento de Stripe con la forma mínima que usa el webhook. */
function evento(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_${unique()}`,
    object: "event",
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const suscripcionStripe = (status: string, clave: string, fin = 1_830_000_000) => ({
  id: suscripcion,
  customer: cliente,
  status,
  metadata: { tenant_id: empresa.tenantId },
  items: { data: [{ price: { lookup_key: clave }, current_period_end: fin }] },
});

const estado = async (): Promise<EstadoCuenta> =>
  (await empresa.dueno.api<EstadoCuenta>("GET", "/cuenta")).body;

describe("webhook de Stripe", () => {
  it("acepta una firma válida y rechaza una inválida o un cuerpo alterado", () => {
    const cuerpo = JSON.stringify(evento("invoice.payment_failed", { customer: cliente }));
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: SECRETO });

    expect(verificarWebhook(stripe, cuerpo, firma, SECRETO).type).toBe("invoice.payment_failed");
    expect(() => verificarWebhook(stripe, cuerpo, firma, "whsec_otro")).toThrow(/firma/);
    expect(() =>
      verificarWebhook(stripe, cuerpo.replace(cliente, "cus_otro"), firma, SECRETO),
    ).toThrow(/firma/);
    expect(() => verificarWebhook(stripe, cuerpo, null, SECRETO)).toThrow(/firma/);
    expect(() => verificarWebhook(stripe, cuerpo, firma, undefined)).toThrow(/secreto/);
    expect(() => createStripe(undefined)).toThrow(/no está configurado/);
  });

  it("traduce cada evento al cambio que produce", () => {
    expect(planDeLookupKey("mijornada_negocio_anual")).toEqual({ plan: "negocio", ciclo: "anual" });
    expect(planDeLookupKey("mijornada_asiento_mensual")).toBeNull();
    expect(asientosAdicionales("crecimiento", 75)).toBe(15);
    expect(asientosAdicionales("crecimiento", 40)).toBe(0);
    expect(asientosAdicionales("negocio", 75)).toBe(0);

    expect(
      cambioDeEvento(
        evento(
          "customer.subscription.updated",
          suscripcionStripe("active", "mijornada_basico_mensual"),
        ),
      ),
    ).toEqual({
      tenantId: empresa.tenantId,
      customerId: cliente,
      subscriptionId: suscripcion,
      plan: "basico",
      ciclo: "mensual",
      planHasta: new Date(1_830_000_000_000).toISOString(),
      pagoFallido: false,
    });
    expect(
      cambioDeEvento(
        evento(
          "customer.subscription.updated",
          suscripcionStripe("past_due", "mijornada_basico_mensual"),
        ),
      )?.pagoFallido,
    ).toBe(true);
    expect(cambioDeEvento(evento("customer.created", { id: cliente }))).toBeNull();
    expect(
      cambioDeEvento(
        evento("checkout.session.completed", {
          mode: "payment",
          client_reference_id: empresa.tenantId,
        }),
      ),
    ).toBeNull();
  });
});

describe("transiciones de plan y bloqueo suave", () => {
  it("empieza en prueba de 14 días con todo disponible", async () => {
    const inicial = await estado();
    expect(inicial).toMatchObject({
      plan: "prueba",
      acceso: "completo",
      motivo: null,
      limite_personas: 60,
      personas_activas: 1,
      tiene_suscripcion: false,
    });
    expect(diasDePrueba(inicial)).toBe(14);
    expect(diasDePrueba(inicial, new Date(Date.now() + 20 * 86_400_000))).toBe(0);
  });

  it("el dueño no puede cambiarse de plan por la API", async () => {
    const ctx = await empresa.dueno.ctx();
    const { error } = await ctx.db
      .schema("tenants")
      .from("empresa")
      .update({ plan: "crecimiento" })
      .eq("id", empresa.tenantId);
    expect(error?.code).toBe("42501");
    expect((await estado()).plan).toBe("prueba");
  });

  it("checkout → activa → pago fallido con gracia → solo lectura → regularización → cancelación", async () => {
    // 1. Termina el checkout: la empresa queda ligada al cliente y a la suscripción.
    const checkout = evento("checkout.session.completed", {
      mode: "subscription",
      client_reference_id: empresa.tenantId,
      customer: cliente,
      subscription: suscripcion,
    });
    expect(await aplicarEventoStripe(admin, checkout)).toEqual({ aplicado: true });
    // El mismo evento otra vez no se aplica dos veces.
    expect(await aplicarEventoStripe(admin, checkout)).toEqual({
      aplicado: false,
      motivo: "duplicado",
    });
    expect(await estado()).toMatchObject({ plan: "prueba", tiene_suscripcion: true });

    // 2. La suscripción queda activa en el plan Básico.
    await aplicarEventoStripe(
      admin,
      evento(
        "customer.subscription.updated",
        suscripcionStripe("active", "mijornada_basico_mensual"),
      ),
    );
    expect(await estado()).toMatchObject({
      plan: "basico",
      plan_ciclo: "mensual",
      limite_personas: 10,
      acceso: "completo",
    });
    await expect(requireCuentaActiva(await empresa.dueno.ctx())).resolves.toBeUndefined();

    // 3. Falla el cobro (el evento llega sin metadatos: se ubica por el cliente).
    await aplicarEventoStripe(admin, evento("invoice.payment_failed", { customer: cliente }));
    // Hay 7 días de gracia (calculo.regla dias_gracia_pago): todo sigue disponible, con aviso.
    const enGracia = await estado();
    expect(enGracia).toMatchObject({ plan: "basico", acceso: "completo", motivo: null });
    const gracia =
      new Date(enGracia.gracia_hasta ?? 0).getTime() -
      new Date(enGracia.pago_fallido_en ?? 0).getTime();
    expect(gracia).toBe(7 * 86_400_000);
    await expect(requireCuentaActiva(await empresa.dueno.ctx())).resolves.toBeUndefined();

    // Pasan los 7 días sin pago: solo lectura.
    await admin
      .schema("tenants")
      .from("empresa")
      .update({ pago_fallido_en: new Date(Date.now() - 7 * 86_400_000 - 60_000).toISOString() })
      .eq("id", empresa.tenantId);
    expect(await estado()).toMatchObject({
      plan: "basico",
      acceso: "solo_lectura",
      motivo: "pago_fallido",
    });

    // Administrar queda en solo lectura...
    const alta = await empresa.dueno.api<{ codigo: string; mensaje: string }>(
      "POST",
      "/trabajadores",
      {
        centro_id: empresa.centroId,
        nombre: "Persona Nueva",
      },
    );
    expect(alta.status).toBe(402);
    expect(alta.body).toMatchObject({ codigo: "solo_lectura" });
    expect(alta.body.mensaje).toMatch(/tu equipo puede seguir marcando/);
    expect((await empresa.dueno.api("POST", "/centros", { nombre: "Sucursal" })).status).toBe(402);
    expect(
      (await empresa.dueno.api("POST", "/documentos", { tipo: "convenio_registro" })).status,
    ).toBe(402);

    // ...pero el registro legal no se interrumpe y nada se oculta.
    const marca = await empleado.api("POST", "/eventos", {
      trabajador_id: empresa.trabajadorId,
      client_event_id: crypto.randomUUID().replace(/^(.{14})./, "$17"),
      tipo: "entrada",
      origen: "pwa",
      ts_dispositivo: new Date().toISOString(),
    });
    expect(marca.status).toBe(200);
    expect((await empresa.dueno.api("GET", "/trabajadores")).status).toBe(200);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
      new Date(),
    );
    expect(
      (await empresa.dueno.api("POST", "/reportes", { tipo: "inspeccion", desde: hoy, hasta: hoy }))
        .status,
    ).toBe(201);
    const incidencia = await empleado.api("POST", "/incidencias", {
      trabajador_id: empresa.trabajadorId,
      fecha: hoy,
      tipo: "permiso",
      motivo: "Cita médica",
    });
    expect(incidencia.status).toBe(201);

    // 4. Se regulariza: vuelve el acceso completo, ahora en el plan Negocio anual.
    await aplicarEventoStripe(
      admin,
      evento(
        "customer.subscription.updated",
        suscripcionStripe("active", "mijornada_negocio_anual"),
      ),
    );
    expect(await estado()).toMatchObject({
      plan: "negocio",
      plan_ciclo: "anual",
      limite_personas: 30,
      acceso: "completo",
      motivo: null,
    });
    expect((await empresa.dueno.api("POST", "/centros", { nombre: "Sucursal" })).status).toBe(201);

    // 5. Cancela: vuelve a "prueba" con la prueba consumida, en solo lectura, sin perder datos.
    await aplicarEventoStripe(
      admin,
      evento(
        "customer.subscription.deleted",
        suscripcionStripe("canceled", "mijornada_negocio_anual"),
      ),
    );
    expect(await estado()).toMatchObject({
      plan: "prueba",
      acceso: "solo_lectura",
      motivo: "prueba_vencida",
      tiene_suscripcion: false,
    });
    expect(
      (await empresa.dueno.api<{ datos: unknown[] }>("GET", "/trabajadores")).body.datos,
    ).toHaveLength(1);
  });

  it("un evento de un cliente ajeno se ignora sin fallar", async () => {
    expect(
      await aplicarEventoStripe(admin, evento("invoice.payment_failed", { customer: "cus_ajeno" })),
    ).toEqual({
      aplicado: false,
      motivo: "sin_empresa",
    });
  });
});
