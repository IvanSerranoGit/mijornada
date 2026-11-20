// Invitación de administradores y supervisores por correo: alta del usuario, enlace de
// un solo uso para fijar contraseña (7 días) y aceptación. Detalle en docs/usuarios.md.
import { bytesToHex, sha256 } from "@mijornada/dominio";
import { z } from "zod";
import type { Ctx, Db } from "./context.ts";
import { CORREOS, type Enviar } from "./correo.ts";
import { requireCuentaActiva } from "./cuenta.ts";
import { ApiError, fromDatabase, invalido } from "./errors.ts";
import { requireTenant } from "./handlers.ts";

export const usuarioInvitar = z
  .object({
    correo: z
      .email("Escribe un correo válido.")
      .max(200)
      .transform((c) => c.toLowerCase()),
    nombre: z.string().trim().min(2, "Escribe su nombre.").max(120),
    rol: z.enum(["administrador", "supervisor"]),
    /** Centro que supervisa; obligatorio para el supervisor. */
    centro_id: z.uuid().optional(),
  })
  .refine((u) => u.rol !== "supervisor" || u.centro_id !== undefined, {
    message: "Elige el centro que va a supervisar.",
    path: ["centro_id"],
  });
export type UsuarioInvitar = z.infer<typeof usuarioInvitar>;

export const invitacionUsuarioAceptar = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  contrasena: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200),
});

export const ROLES: Record<string, string> = {
  dueno: "Dueño",
  administrador: "Administrador",
  supervisor: "Supervisor",
};

const encoder = new TextEncoder();
const nuevoToken = () => bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(24)));
const hashToken = async (token: string) => bytesToHex(await sha256(encoder.encode(token)));

export interface UsuarioListado {
  id: string;
  rol: string;
  nombre: string | null;
  correo: string;
  centro_id: string | null;
  activo: boolean;
  invitacion_pendiente: boolean;
  creado_en: string;
}

/** Dueño, administradores y supervisores del tenant, con su correo. Solo para administradores. */
export async function listEquipo(ctx: Ctx): Promise<UsuarioListado[]> {
  const { data, error } = await ctx.db.schema("tenants").rpc("usuarios_del_tenant");
  if (error) throw fromDatabase(error);
  return data;
}

/**
 * Invita a un administrador o a un supervisor. Solo el dueño invita administradores; un
 * administrador puede invitar supervisores. Devuelve el enlace para fijar contraseña y si
 * se pudo enviar por correo (si no, quien invita lo comparte a mano).
 */
export async function inviteUsuario(
  ctx: Ctx,
  input: UsuarioInvitar,
  servicios: { admin: () => Db; correo: Enviar },
  origin: string,
) {
  await requireCuentaActiva(ctx);
  const tenantId = requireTenant(ctx);
  if (
    ctx.sesion.rol !== "dueno" &&
    !(ctx.sesion.rol === "administrador" && input.rol === "supervisor")
  ) {
    throw new ApiError(403, "sin_permiso", "Solo el dueño puede invitar administradores.");
  }
  const admin = servicios.admin();

  // La cuenta de Auth: nueva, o la que ya exista con ese correo.
  const creada = await admin.auth.admin.createUser({ email: input.correo, email_confirm: true });
  let authUserId = creada.data.user?.id ?? null;
  if (creada.error) {
    if (creada.error.code !== "email_exists")
      throw invalido("No se pudo crear la cuenta con ese correo.");
    const enlace = await admin.auth.admin.generateLink({ type: "magiclink", email: input.correo });
    authUserId = enlace.data.user?.id ?? null;
  }
  if (authUserId === null) throw new ApiError(500, "error_interno", "No se pudo crear la cuenta.");

  const { data: existente } = await admin
    .schema("tenants")
    .from("usuario")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("activo", true)
    .limit(1);
  if ((existente ?? []).length > 0) {
    throw new ApiError(
      409,
      "correo_en_uso",
      "Ese correo ya tiene acceso a Mi Jornada. Usa otro correo.",
    );
  }

  // El alta pasa por RLS con la sesión de quien invita.
  const { data: usuario, error } = await ctx.db
    .schema("tenants")
    .from("usuario")
    .insert({
      tenant_id: tenantId,
      auth_user_id: authUserId,
      rol: input.rol,
      nombre: input.nombre,
      centro_id: input.rol === "supervisor" ? (input.centro_id ?? null) : null,
    })
    .select("id, rol, nombre, centro_id")
    .single();
  if (error) {
    if (!creada.error) await admin.auth.admin.deleteUser(authUserId);
    throw fromDatabase(error);
  }

  const token = nuevoToken();
  const { error: invitacion } = await admin
    .schema("tenants")
    .from("invitacion_usuario")
    .insert({ usuario_id: usuario.id, tenant_id: tenantId, token_hash: await hashToken(token) });
  if (invitacion) throw fromDatabase(invitacion);

  const { data: empresa } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("razon_social")
    .eq("id", tenantId)
    .single();
  const enlace = `${origin}/invitacion-usuario/${token}`;
  const enviado = await servicios.correo(
    CORREOS.invitacionUsuario(input.correo, {
      empresa: empresa?.razon_social ?? "tu negocio",
      rol: (ROLES[input.rol] ?? input.rol).toLowerCase(),
      enlace,
    }),
  );
  return { ...usuario, correo: input.correo, enlace, correo_enviado: enviado };
}

/** A quién corresponde un enlace de invitación vigente; null si no existe, venció o ya se usó. */
export async function getInvitacionUsuario(admin: Db, token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data, error } = await admin
    .schema("tenants")
    .rpc("invitacion_de_usuario", { p_token: token });
  if (error) throw fromDatabase(error);
  return data[0] ?? null;
}

/**
 * La persona invitada fija su contraseña. El enlace queda usado. Devuelve el correo para
 * iniciar sesión enseguida.
 */
export async function acceptInvitacionUsuario(
  admin: Db,
  input: z.infer<typeof invitacionUsuarioAceptar>,
): Promise<{ correo: string }> {
  const invitacion = await getInvitacionUsuario(admin, input.token);
  if (invitacion === null) {
    throw new ApiError(
      404,
      "invitacion_invalida",
      "La invitación ya se usó o venció. Pide una nueva.",
    );
  }
  const { error } = await admin.auth.admin.updateUserById(invitacion.auth_user_id, {
    password: input.contrasena,
  });
  if (error) throw invalido("No se pudo guardar la contraseña. Prueba con una más larga.");

  const { error: usada } = await admin
    .schema("tenants")
    .from("invitacion_usuario")
    .update({ aceptada_en: new Date().toISOString() })
    .eq("usuario_id", invitacion.usuario_id);
  if (usada) throw fromDatabase(usada);
  return { correo: invitacion.correo };
}
