import { aplicarEventoStripe, createStripe, errorResponse, verificarWebhook } from "@mijornada/api";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin.ts";

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
    return Response.json(await aplicarEventoStripe(createSupabaseAdmin(), evento));
  } catch (error) {
    return errorResponse(error);
  }
}
