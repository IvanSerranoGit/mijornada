// Crea en Stripe lo que Mi Jornada necesita: productos, precios (con su lookup_key), la
// tasa de IVA y los cupones del piloto. Es idempotente: lo que ya existe no se duplica.
//
//   STRIPE_SECRET_KEY=sk_test_... node packages/api/src/stripe-setup.ts
//   STRIPE_SECRET_KEY=sk_live_... node packages/api/src/stripe-setup.ts --vivo
//
// Con una llave de modo real exige --vivo: crear cosas en producción es una decisión
// explícita. Detalle en docs/planes-y-cobro.md.
import Stripe from "stripe";
import {
  IVA,
  LOOKUP_ASIENTO,
  lookupKey,
  PLANES,
  PLANES_PAGADOS,
  PRECIO_ASIENTO_MXN,
  type Ciclo,
} from "./pagos.ts";

/** Cupones del piloto: 100 % de descuento durante 3 meses, un canje cada uno. */
export const CUPONES_PILOTO = ["PILOTO-MJ-A", "PILOTO-MJ-B", "PILOTO-MJ-C"] as const;

const INTERVALO: Record<Ciclo, Stripe.PriceCreateParams.Recurring.Interval> = {
  mensual: "month",
  anual: "year",
};

async function producto(stripe: Stripe, clave: string, nombre: string, descripcion: string) {
  const existentes = await stripe.products.search({ query: `metadata['clave']:'${clave}'` });
  return (
    existentes.data[0] ??
    (await stripe.products.create({ name: nombre, description: descripcion, metadata: { clave } }))
  );
}

async function precio(
  stripe: Stripe,
  productoId: string,
  clave: string,
  pesos: number,
  ciclo: Ciclo,
) {
  const existentes = await stripe.prices.list({ lookup_keys: [clave], limit: 1 });
  if (existentes.data[0]) return existentes.data[0];
  return stripe.prices.create({
    product: productoId,
    currency: "mxn",
    unit_amount: pesos * 100,
    // El precio que ve el cliente ya incluye el IVA; la factura lo desglosa.
    tax_behavior: "inclusive",
    recurring: { interval: INTERVALO[ciclo] },
    lookup_key: clave,
  });
}

export async function setupStripe(stripe: Stripe): Promise<string[]> {
  const hecho: string[] = [];

  for (const plan of PLANES_PAGADOS) {
    const datos = PLANES[plan];
    const p = await producto(
      stripe,
      `mijornada_${plan}`,
      `Mi Jornada ${datos.nombre}`,
      datos.descripcion,
    );
    for (const ciclo of ["mensual", "anual"] as const) {
      const creado = await precio(stripe, p.id, lookupKey(plan, ciclo), datos[ciclo], ciclo);
      hecho.push(`${lookupKey(plan, ciclo)} → ${creado.id}`);
    }
  }

  const asiento = await producto(
    stripe,
    "mijornada_asiento",
    "Mi Jornada: persona adicional",
    "Persona adicional a las 60 incluidas en el plan Crecimiento.",
  );
  hecho.push(
    `${LOOKUP_ASIENTO.mensual} → ${(await precio(stripe, asiento.id, LOOKUP_ASIENTO.mensual, PRECIO_ASIENTO_MXN, "mensual")).id}`,
    `${LOOKUP_ASIENTO.anual} → ${(await precio(stripe, asiento.id, LOOKUP_ASIENTO.anual, PRECIO_ASIENTO_MXN * 10, "anual")).id}`,
  );

  const tasas = await stripe.taxRates.list({ active: true, limit: 100 });
  const iva =
    tasas.data.find((tasa) => tasa.metadata?.["clave"] === IVA.metadata) ??
    (await stripe.taxRates.create({
      display_name: IVA.nombre,
      percentage: IVA.porcentaje,
      inclusive: true,
      country: "MX",
      metadata: { clave: IVA.metadata },
    }));
  hecho.push(`IVA 16 % incluido → ${iva.id}`);

  const cupones = await stripe.coupons.list({ limit: 100 });
  const cupon =
    cupones.data.find((c) => c.metadata?.["clave"] === "mijornada_piloto") ??
    (await stripe.coupons.create({
      name: "Piloto Mi Jornada: 3 meses",
      percent_off: 100,
      duration: "repeating",
      duration_in_months: 3,
      metadata: { clave: "mijornada_piloto" },
    }));
  for (const codigo of CUPONES_PILOTO) {
    const existentes = await stripe.promotionCodes.list({ code: codigo, limit: 1 });
    const promo =
      existentes.data[0] ??
      (await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: cupon.id },
        code: codigo,
        max_redemptions: 1,
      }));
    hecho.push(`cupón ${codigo} → ${promo.id}`);
  }
  return hecho;
}

if (import.meta.main) {
  const llave = process.env["STRIPE_SECRET_KEY"] ?? "";
  if (!/^sk_(test|live)_/.test(llave)) {
    console.error("Falta STRIPE_SECRET_KEY (sk_test_… o sk_live_…).");
    process.exit(1);
  }
  if (llave.startsWith("sk_live_") && !process.argv.includes("--vivo")) {
    console.error(
      "La llave es de modo real. Si de verdad quieres crear en producción, agrega --vivo.",
    );
    process.exit(1);
  }
  console.log(`Modo ${llave.startsWith("sk_live_") ? "REAL" : "de prueba"}:`);
  for (const linea of await setupStripe(new Stripe(llave))) console.log(`  ${linea}`);
}
