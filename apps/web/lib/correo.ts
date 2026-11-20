import "server-only";
import { crearEnvio } from "@mijornada/api";

/** Envío de correo del servidor: Resend con el remitente del producto. */
export const enviarCorreo = crearEnvio({
  apiKey: process.env["RESEND_API_KEY"],
  remitente: process.env["CORREO_REMITENTE"] ?? "Mi Jornada <hola@mijornada.xyz>",
});
