import { diasDePrueba, getEmpresa, getEstadoCuenta, PLANES, PLANES_PAGADOS } from "@mijornada/api";
import { Chip, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fechaCorta } from "../../../lib/formato.ts";
import { getCtx } from "../../../lib/supabase/server.ts";
import { Facturacion, Planes, Portal } from "./Planes.tsx";

export const metadata: Metadata = { title: "Plan · Mi Jornada" };
export const dynamic = "force-dynamic";

// Plan de la empresa: prueba, planes con precio, portal de facturación y datos fiscales.
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel/plan");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") redirect("/panel");

  const [estado, empresa, { pago }] = await Promise.all([
    getEstadoCuenta(ctx),
    getEmpresa(ctx, ctx.sesion.tenantId),
    searchParams,
  ]);
  const dias = diasDePrueba(estado);
  const sugerido =
    PLANES_PAGADOS.find((plan) => estado.personas_activas <= PLANES[plan].personas) ??
    "crecimiento";
  const pagado = estado.plan !== "prueba";

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-1 font-bold">Plan</h1>
        <p className="text-text-secondary">
          Tu equipo nunca deja de poder marcar, pase lo que pase con el pago.
        </p>
      </section>

      {pago === "listo" ? (
        <p
          role="status"
          className="rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md) text-pequeno text-text-brand"
        >
          Recibimos tu contratación. En unos segundos verás aquí tu plan activo; si no aparece,
          recarga la página.
        </p>
      ) : null}

      <Tarjeta className="flex flex-col gap-(--espacio-sm)">
        <div className="flex flex-wrap items-center justify-between gap-(--espacio-xs)">
          <h2 className="font-titulo text-titulo-3 font-bold">
            {pagado
              ? `Plan ${PLANES[estado.plan as keyof typeof PLANES].nombre}`
              : "Prueba gratuita"}
          </h2>
          <Chip tono={estado.acceso === "completo" ? "bien" : "critico"}>
            {estado.acceso === "completo" ? "Activo" : "Solo lectura"}
          </Chip>
        </div>
        <p className="text-pequeno">
          {estado.motivo === "pago_fallido"
            ? "No pudimos cobrar tu plan. Actualiza tu forma de pago para volver a administrar."
            : estado.motivo === "prueba_vencida"
              ? "Tu prueba terminó. Elige un plan para volver a dar de alta personas y cambiar la configuración."
              : pagado
                ? `Pago ${estado.plan_ciclo === "anual" ? "anual" : "mensual"}${estado.plan_hasta ? ` · periodo pagado hasta el ${fechaCorta(estado.plan_hasta)}` : ""}.`
                : `Te ${dias === 1 ? "queda 1 día" : `quedan ${String(dias)} días`} de prueba, sin tarjeta.`}
        </p>
        <p className="text-pequeno text-text-secondary">
          {estado.personas_activas} de {estado.limite_personas} personas incluidas.
          {estado.personas_activas > estado.limite_personas
            ? estado.plan === "crecimiento"
              ? " Las adicionales se cobran a $20 por persona al mes."
              : " Ya pasaste el límite de tu plan: te conviene subir al siguiente."
            : ""}
        </p>
        {estado.tiene_suscripcion ? <Portal /> : null}
      </Tarjeta>

      {estado.tiene_suscripcion ? null : (
        <section className="flex flex-col gap-(--espacio-md)">
          <h2 className="font-titulo text-titulo-3 font-bold">Elige tu plan</h2>
          <Planes personas={estado.personas_activas} sugerido={sugerido} />
          <p className="text-pequeno text-text-secondary">
            {dias > 2 ? "Si contratas hoy, el primer cobro se hace al terminar tu prueba. " : ""}
            El pago lo procesa Stripe; puedes cancelar cuando quieras.
          </p>
        </section>
      )}

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <div>
          <h2 className="font-titulo text-titulo-3 font-bold">Factura</h2>
          <p className="text-pequeno text-text-secondary">
            Stripe te envía el recibo de cada pago con el IVA desglosado. Si necesitas factura
            fiscal (CFDI), guarda aquí tus datos y solicítala a{" "}
            <a href="mailto:facturacion@mijornada.xyz" className="text-text-brand underline">
              facturacion@mijornada.xyz
            </a>
            ; la emitimos a nombre de {empresa.razon_social}.
          </p>
        </div>
        <Facturacion datos={empresa} />
      </Tarjeta>
    </>
  );
}
