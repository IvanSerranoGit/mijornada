import { datosLegalesFaltantes, diasDePrueba, getEmpresa, getEstadoCuenta } from "@mijornada/api";
import Link from "next/link";
import { getCtx } from "../../lib/supabase/server.ts";

/**
 * Aviso de cuenta sobre todas las secciones del panel: solo lectura (prueba vencida o pago
 * fallido), prueba por terminar o límite de personas rebasado. Sin nada que avisar, nada.
 */
export async function AvisoDeCuenta() {
  const ctx = await getCtx();
  if (ctx === null || ctx.sesion.tenantId === null) return null;
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") return null;
  const estado = await getEstadoCuenta(ctx).catch(() => null);
  if (estado === null) return null;

  const dias = diasDePrueba(estado);
  let mensaje: string | null = null;
  let critico = false;
  if (estado.motivo === "pago_fallido") {
    critico = true;
    mensaje =
      "No pudimos cobrar tu plan: el panel está en solo lectura. Tu equipo puede seguir marcando.";
  } else if (estado.pago_fallido_en !== null && estado.gracia_hasta !== null) {
    critico = true;
    mensaje = `No pudimos cobrar tu plan. Actualiza tu forma de pago antes del ${new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(estado.gracia_hasta))} para que el panel no quede en solo lectura.`;
  } else if (estado.motivo === "prueba_vencida") {
    critico = true;
    mensaje =
      "Tu prueba gratuita terminó: el panel está en solo lectura. Tu equipo puede seguir marcando.";
  } else if (estado.plan === "prueba" && dias <= 4) {
    mensaje = `Tu prueba gratuita termina en ${dias === 1 ? "1 día" : `${String(dias)} días`}.`;
  } else if (estado.personas_activas > estado.limite_personas && estado.plan !== "crecimiento") {
    mensaje = `Tienes ${String(estado.personas_activas)} personas y tu plan incluye ${String(estado.limite_personas)}. Te conviene subir de plan.`;
  }
  if (mensaje === null) return <CamposVacios tenantId={ctx.sesion.tenantId} />;

  return (
    <>
      <CamposVacios tenantId={ctx.sesion.tenantId} />
      <p
        role="status"
        className={
          critico
            ? "rounded-(--radio-md) bg-status-critical-soft p-(--espacio-md) text-pequeno text-status-critical"
            : "rounded-(--radio-md) bg-status-warning-soft p-(--espacio-md) text-pequeno text-status-warning-text"
        }
      >
        {mensaje}{" "}
        <Link href="/panel/plan" className="font-medium underline">
          {critico ? "Regularizar" : "Ver planes"}
        </Link>
      </p>
    </>
  );
}

/** Aviso de que al convenio y al aviso de privacidad les faltan datos del negocio. */
async function CamposVacios({ tenantId }: { tenantId: string }) {
  const ctx = await getCtx();
  if (ctx === null) return null;
  const empresa = await getEmpresa(ctx, tenantId).catch(() => null);
  if (empresa === null) return null;
  const faltantes = datosLegalesFaltantes(empresa);
  if (faltantes.length === 0) return null;
  return (
    <p
      role="status"
      className="rounded-(--radio-md) bg-status-warning-soft p-(--espacio-md) text-pequeno text-status-warning-text"
    >
      Tus documentos tienen campos vacíos: falta {faltantes.join(", ")}.{" "}
      <Link href="/panel/documentos" className="font-medium underline">
        Completarlos
      </Link>
    </p>
  );
}
