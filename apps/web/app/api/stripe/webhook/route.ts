import {
  aplicarEventoStripe,
  avisarPagoFallido,
  createStripe,
  errorResponse,
  verificarWebhook,
  type Db,
} from "@mijornada/api";
import { enviarCorreo } from "../../../../lib/correo.ts";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin.ts";
import { SITE_URL } from "../../../../lib/supabase/env.ts";

async function tenantDeCliente(
  admin: Db,
  cliente: string | { id: string } | null,
): Promise<string | null> {
  const id = typeof cliente === "string" ? cliente : (cliente?.id ?? null);
  if (id === null) return null;
  const { data } = await admin
    .schema("tenants")
    .from("empresa")
    .select("id")
    .eq("stripe_customer_id", id)
    .maybeSingle();
  return data?.id ?? null;
}

// Webhook de Stripe. Comprueba la firma con el cuerpo tal como llegó y aplica el cambio
// de plan con rol de servicio (es un job del servidor: no hay usuario). Es idempotente.
export async function POST(request: Request): Promise<Response> {
  try {
    const stripe = createStripe(process.env["STRIPE_SECRET_KEY"]);
    const evento = verificarWebhook(
      stripe,
      await request.text(),
      request.headers.get("stripe-signature"),
      process.env["STRIPE_WEBHOOK_SECRET"],
    );
    const admin = createSupabaseAdmin();
    const resultado = await aplicarEventoStripe(admin, evento);
    // Día 0 de un cobro fallido: se avisa al dueño en cuanto Stripe lo informa.
    if (resultado.aplicado && evento.type === "invoice.payment_failed") {
      const tenantId = await tenantDeCliente(admin, evento.data.object.customer);
      if (tenantId !== null) await avisarPagoFallido(admin, enviarCorreo, tenantId, SITE_URL);
    }
    return Response.json(resultado);
  } catch (error) {
    return errorResponse(error);
  }
}
