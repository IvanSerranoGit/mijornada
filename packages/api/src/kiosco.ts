// API del kiosco. El kiosco no tiene sesión de usuario: su credencial es el token
// de dispositivo que recibe al canjear el código de enlace.
import { bytesToHex, sha256 } from "@mijornada/dominio";
import { z } from "zod";
import type { Db } from "./context.ts";
import { ApiError, errorResponseFrom, fromDatabase } from "./errors.ts";

export const kioscoVincular = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, "El código son 8 letras y números."),
});

export const kioscoMarcar = z
  .object({
    client_event_id: z.uuid(),
    ts_dispositivo: z.iso.datetime({ offset: true }),
    pin: z
      .string()
      .regex(/^\d{4}$/, "El PIN son 4 dígitos.")
      .optional(),
    qr: z.string().min(16).max(200).optional(),
    foto_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .refine((v) => v.pin !== undefined || v.qr !== undefined, "Falta el PIN o el código QR.");

export const kioscoDesvincular = z.object({
  pin_admin: z.string().regex(/^\d{6}$/, "El PIN son 6 dígitos."),
});

export type KioscoMarcar = z.infer<typeof kioscoMarcar>;

export async function vincularKiosco(publico: Db, codigo: string) {
  const { data, error } = await publico
    .schema("tenants")
    .rpc("vincular_dispositivo", { p_codigo: codigo });
  if (error) throw fromDatabase(error);
  const vinculo = data[0];
  if (vinculo === undefined) throw new ApiError(404, "no_encontrado", "El código no es válido.");
  return vinculo;
}

export async function estadoKiosco(publico: Db, token: string) {
  const { data, error } = await publico.schema("tenants").rpc("kiosco_estado", { p_token: token });
  if (error) throw fromDatabase(error);
  const estado = data[0];
  if (estado === undefined)
    throw new ApiError(403, "sin_permiso", "Este kiosco no está vinculado.");
  return estado;
}

export async function marcarEnKiosco(publico: Db, token: string, input: KioscoMarcar) {
  const { data, error } = await publico.schema("jornada").rpc("kiosco_marcar", {
    p_token: token,
    p_client_event_id: input.client_event_id,
    p_ts_dispositivo: input.ts_dispositivo,
    ...(input.pin === undefined ? {} : { p_pin: input.pin }),
    ...(input.qr === undefined ? {} : { p_qr: input.qr }),
    ...(input.foto_hash === undefined ? {} : { p_foto_hash: input.foto_hash }),
  });
  if (error) throw fromDatabase(error);
  const marca = data[0];
  if (marca === undefined) throw new ApiError(500, "error_interno", "No se registró el marcaje.");
  return marca;
}

export async function desvincularKiosco(publico: Db, token: string, pinAdmin: string) {
  const { error } = await publico
    .schema("tenants")
    .rpc("desvincular_dispositivo", { p_token: token, p_pin_admin: pinAdmin });
  if (error) throw fromDatabase(error);
  return { desvinculado: true };
}

/**
 * Sube la foto de un marcaje hecho en el kiosco. Solo se acepta si el evento es
 * de ese dispositivo y el contenido coincide con el foto_hash ya registrado.
 */
export async function subirFotoKiosco(
  admin: Db,
  token: string,
  eventoId: string,
  foto: Uint8Array,
) {
  const tokenHash = bytesToHex(await sha256(new TextEncoder().encode(token)));
  const { data: dispositivo } = await admin
    .schema("tenants")
    .from("dispositivo")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revocado_en", null)
    .maybeSingle();
  if (!dispositivo) throw new ApiError(403, "sin_permiso", "Este kiosco no está vinculado.");

  const { data: evento } = await admin
    .schema("jornada")
    .from("evento")
    .select("foto_url, foto_hash")
    .eq("id", eventoId)
    .eq("dispositivo_id", dispositivo.id)
    .maybeSingle();
  if (!evento?.foto_url || evento.foto_hash !== bytesToHex(await sha256(foto))) {
    throw new ApiError(422, "foto_invalida", "La foto no corresponde a ese marcaje.");
  }

  const { error } = await admin.storage
    .from("marcajes")
    .upload(evento.foto_url, foto, { contentType: "image/jpeg", upsert: true });
  if (error)
    throw new ApiError(502, "foto_no_guardada", "No se pudo guardar la foto. Se reintentará.");
  return { ruta: evento.foto_url };
}

export interface KioscoOptions {
  /** Cliente sin sesión (llave pública). */
  publico: Db;
  /** Cliente con rol de servicio: solo para guardar fotos. */
  admin: () => Db;
}

/** Atiende /api/v1/kiosco/<segments>. El token viaja en `Authorization: Bearer`. */
export async function handleKioscoRequest(
  request: Request,
  segments: string[],
  options: KioscoOptions,
): Promise<Response> {
  const json = (status: number, body: unknown) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const ruta = `${request.method} /${segments.join("/")}`;
    if (ruta === "POST /vincular") {
      const { codigo } = kioscoVincular.parse(await request.json());
      return json(201, await vincularKiosco(options.publico, codigo));
    }

    const header = request.headers.get("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (token === "") throw new ApiError(401, "no_autenticado", "Falta el token del dispositivo.");

    if (ruta === "GET /estado") return json(200, await estadoKiosco(options.publico, token));
    if (ruta === "POST /marcar") {
      return json(
        200,
        await marcarEnKiosco(options.publico, token, kioscoMarcar.parse(await request.json())),
      );
    }
    if (ruta === "POST /desvincular") {
      const { pin_admin } = kioscoDesvincular.parse(await request.json());
      return json(200, await desvincularKiosco(options.publico, token, pin_admin));
    }
    if (request.method === "PUT" && segments.length === 2 && segments[0] === "foto") {
      const eventoId = z.uuid().parse(segments[1]);
      const foto = new Uint8Array(await request.arrayBuffer());
      if (foto.length === 0 || foto.length > 2_097_152) {
        throw new ApiError(413, "foto_invalida", "La foto debe pesar menos de 2 MB.");
      }
      return json(201, await subirFotoKiosco(options.admin(), token, eventoId, foto));
    }
    throw new ApiError(404, "ruta_no_encontrada", "La ruta no existe en /api/v1/kiosco.");
  } catch (error) {
    return errorResponseFrom(error);
  }
}
