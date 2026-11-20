"use server";

import {
  ApiError,
  checkoutCrear,
  createCheckout,
  createPortal,
  facturacionActualizar,
  updateFacturacion,
} from "@mijornada/api";
import { redirect } from "next/navigation";
import { campo, ejecutar, type Resultado } from "../../../lib/acciones.ts";
import { servicios } from "../../../lib/servicios.ts";
import { SITE_URL } from "../../../lib/supabase/env.ts";
import { getCtx } from "../../../lib/supabase/server.ts";

/** Lleva al Checkout de Stripe para contratar el plan elegido. */
export async function contratar(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Tu sesión terminó. Vuelve a entrar." };
  let url: string;
  try {
    const datos = checkoutCrear.parse({ plan: formData.get("plan"), ciclo: formData.get("ciclo") });
    ({ url } = await createCheckout(ctx, servicios.stripe(), datos, SITE_URL));
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  redirect(url);
}

/** Lleva al portal de facturación de Stripe (cambiar plan, tarjeta o cancelar). */
export async function abrirPortal(): Promise<Resultado> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Tu sesión terminó. Vuelve a entrar." };
  let url: string;
  try {
    ({ url } = await createPortal(ctx, servicios.stripe(), SITE_URL));
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
  redirect(url);
}

/** Datos fiscales para la factura, que se solicita por correo. */
export async function guardarFacturacion(
  _previo: Resultado,
  formData: FormData,
): Promise<Resultado> {
  return ejecutar(async (ctx) => {
    await updateFacturacion(
      ctx,
      facturacionActualizar.parse({
        rfc: campo(formData, "rfc") ?? null,
        regimen_fiscal: campo(formData, "regimen_fiscal") ?? null,
        cp_fiscal: campo(formData, "cp_fiscal") ?? null,
        uso_cfdi: campo(formData, "uso_cfdi") ?? null,
      }),
    );
    return "Datos de facturación guardados.";
  });
}
