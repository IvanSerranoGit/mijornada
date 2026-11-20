import "server-only";
import { createStripe, type Servicios } from "@mijornada/api";
import QRCode from "qrcode";
import { enviarCorreo } from "./correo.ts";
import { htmlToPdf } from "./pdf.ts";
import { createSupabaseAdmin } from "./supabase/admin.ts";

/** Lo que la API necesita del servidor: PDF con Playwright, QR y el cliente de servicio. */
export const servicios: Servicios = {
  pdf: htmlToPdf,
  qr: (texto) => QRCode.toString(texto, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  admin: createSupabaseAdmin,
  stripe: () => createStripe(process.env["STRIPE_SECRET_KEY"]),
  correo: enviarCorreo,
};
