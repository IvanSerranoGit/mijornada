// Acceso de los trabajadores a la PWA: invitación y entrada con correo + PIN.
// Estas operaciones necesitan un cliente con rol de servicio (solo en el servidor)
// porque crean cuentas de Auth y abren sesiones sin contraseña.
import { z } from "zod";
import type { Ctx, Db } from "./context.ts";
import { requireCuentaActiva } from "./cuenta.ts";
import { ApiError, fromDatabase } from "./errors.ts";

export const accesoConPin = z.object({
  correo: z.email("Escribe un correo válido.").trim().toLowerCase(),
  pin: z.string().regex(/^\d{4}$/, "El PIN son 4 dígitos."),
});
export const invitacionAceptar = accesoConPin.extend({ token: z.string().min(16).max(200) });

export type AccesoConPin = z.infer<typeof accesoConPin>;
export type InvitacionAceptar = z.infer<typeof invitacionAceptar>;

/** Con esto el servidor abre la sesión: `auth.verifyOtp({ token_hash, type: "email" })`. */
export interface AccesoConcedido {
  tokenHash: string;
}

/** Genera un enlace personal de un solo uso para que el trabajador active su acceso. */
export async function createInvitacion(ctx: Ctx, trabajadorId: string) {
  await requireCuentaActiva(ctx);
  const { data, error } = await ctx.db
    .schema("tenants")
    .rpc("crear_invitacion", { trabajador_id: trabajadorId });
  if (error) throw fromDatabase(error);
  return { token: data };
}

/** Nombre de pila y empresa de una invitación vigente; null si no existe o ya se usó. */
export async function getInvitacion(publico: Db, token: string) {
  const { data, error } = await publico
    .schema("tenants")
    .rpc("invitacion_info", { p_token: token });
  if (error) throw fromDatabase(error);
  return data[0] ?? null;
}

async function magicLink(admin: Db, correo: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) return null;
  return { authUserId: data.user.id, tokenHash: data.properties.hashed_token };
}

const ACCESO_INVALIDO = new ApiError(403, "acceso_invalido", "El correo o el PIN no coinciden.");

/** Activa el acceso: crea la cuenta del trabajador, comprueba su PIN y lo liga como empleado. */
export async function acceptInvitacion(
  admin: Db,
  input: InvitacionAceptar,
): Promise<AccesoConcedido> {
  if ((await getInvitacion(admin, input.token)) === null) {
    throw new ApiError(
      404,
      "invitacion_invalida",
      "La invitación ya se usó o venció. Pide una nueva.",
    );
  }

  const creada = await admin.auth.admin.createUser({ email: input.correo, email_confirm: true });
  if (creada.error && creada.error.code !== "email_exists") {
    throw new ApiError(422, "correo_invalido", "No se pudo crear la cuenta con ese correo.");
  }

  const enlace = await magicLink(admin, input.correo);
  if (enlace === null)
    throw new ApiError(500, "error_interno", "No se pudo abrir la sesión. Intenta de nuevo.");

  const { data: existente } = await admin
    .schema("tenants")
    .from("usuario")
    .select("id")
    .eq("auth_user_id", enlace.authUserId)
    .eq("activo", true)
    .limit(1);
  if ((existente ?? []).length > 0) {
    throw new ApiError(
      409,
      "correo_en_uso",
      "Ese correo ya tiene acceso a Mi Jornada. Usa otro correo.",
    );
  }

  const { error } = await admin.schema("tenants").rpc("aceptar_invitacion", {
    p_token: input.token,
    p_pin: input.pin,
    p_auth_user_id: enlace.authUserId,
  });
  if (error) {
    // La cuenta recién creada no debe quedar huérfana si el PIN no coincidió.
    if (!creada.error) await admin.auth.admin.deleteUser(enlace.authUserId);
    throw fromDatabase(error);
  }
  return { tokenHash: enlace.tokenHash };
}

/** Entrada del trabajador con correo + PIN. No distingue "no existe" de "PIN incorrecto". */
export async function loginConPin(admin: Db, input: AccesoConPin): Promise<AccesoConcedido> {
  const cuenta = await admin
    .schema("tenants")
    .rpc("cuenta_de_empleado", { p_correo: input.correo });
  if (cuenta.error) throw fromDatabase(cuenta.error);
  if (!cuenta.data) throw ACCESO_INVALIDO;

  const { data, error } = await admin.schema("tenants").rpc("verificar_pin_de_cuenta", {
    p_auth_user_id: cuenta.data,
    p_pin: input.pin,
  });
  if (error) throw fromDatabase(error);
  if (!data) throw ACCESO_INVALIDO;

  // Solo con el PIN correcto se genera el enlace que abre la sesión.
  const enlace = await magicLink(admin, input.correo);
  if (enlace === null)
    throw new ApiError(500, "error_interno", "No se pudo abrir la sesión. Intenta de nuevo.");
  return { tokenHash: enlace.tokenHash };
}
