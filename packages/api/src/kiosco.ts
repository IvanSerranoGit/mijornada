// API del kiosco. El kiosco no tiene sesión de usuario: su credencial es el token
// de dispositivo que recibe al canjear el código de enlace.
import { bytesToHex, markdownToHtml, renderTemplate, sha256 } from "@mijornada/dominio";
import { z } from "zod";
import type { Db } from "./context.ts";
import { ApiError, errorResponseFrom, fromDatabase } from "./errors.ts";
import { origenDe, varsCentro, type Origen } from "./documentos.ts";
import { fotoEstadoDeclarado, fotoMotivo } from "./schemas.ts";

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
    foto_estado: fotoEstadoDeclarado.optional(),
    foto_motivo: fotoMotivo.optional(),
  })
  .refine((v) => v.pin !== undefined || v.qr !== undefined, "Falta el PIN o el código QR.");

const credencial = {
  pin: z
    .string()
    .regex(/^\d{4}$/, "El PIN son 4 dígitos.")
    .optional(),
  qr: z.string().min(16).max(200).optional(),
};
const conCredencial = (v: { pin?: string | undefined; qr?: string | undefined }) =>
  v.pin !== undefined || v.qr !== undefined;

export const kioscoAviso = z
  .object(credencial)
  .refine(conCredencial, "Falta el PIN o el código QR.");
export const kioscoAceptar = z
  .object({ ...credencial, documento_id: z.uuid() })
  .refine(conCredencial, "Falta el PIN o el código QR.");

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
    ...(input.foto_estado === undefined ? {} : { p_foto_estado: input.foto_estado }),
    ...(input.foto_motivo === undefined ? {} : { p_foto_motivo: input.foto_motivo }),
  });
  if (error) throw fromDatabase(error);
  const marca = data[0];
  if (marca === undefined) throw new ApiError(500, "error_interno", "No se registró el marcaje.");
  return marca;
}

/**
 * Antes de marcar: ¿esta persona tiene pendiente el aviso de privacidad? Si lo tiene,
 * devuelve el aviso simplificado listo para mostrar.
 */
export async function avisoPendienteKiosco(
  publico: Db,
  token: string,
  input: z.infer<typeof kioscoAviso>,
  origin: string,
) {
  const { data, error } = await publico.schema("cumplimiento").rpc("kiosco_aviso_pendiente", {
    p_token: token,
    ...(input.pin === undefined ? {} : { p_pin: input.pin }),
    ...(input.qr === undefined ? {} : { p_qr: input.qr }),
  });
  if (error) throw fromDatabase(error);
  const aviso = data[0];
  // Una empresa sin documentos todavía no tiene nada que aceptar.
  if (aviso === undefined || !aviso.pendiente) return { pendiente: false as const };
  const vars = varsCentro({ ...aviso, id: aviso.centro_id, nombre: "" }, origin);
  return {
    pendiente: true as const,
    nombre: aviso.nombre,
    documento_id: aviso.documento_id,
    version: aviso.version,
    resumen_html: markdownToHtml(renderTemplate(aviso.resumen_md, vars)),
  };
}

/** "Acepto y marco": registra con método clic la aceptación del aviso de privacidad. */
export async function aceptarEnKiosco(
  publico: Db,
  token: string,
  input: z.infer<typeof kioscoAceptar>,
  origen: Origen,
) {
  const { data, error } = await publico.schema("cumplimiento").rpc("kiosco_aceptar", {
    p_token: token,
    p_documento_id: input.documento_id,
    ...(input.pin === undefined ? {} : { p_pin: input.pin }),
    ...(input.qr === undefined ? {} : { p_qr: input.qr }),
    ...(origen.ip === null ? {} : { p_ip: origen.ip }),
    ...(origen.userAgent === null ? {} : { p_user_agent: origen.userAgent }),
  });
  if (error) throw fromDatabase(error);
  const aceptacion = data[0];
  if (aceptacion === undefined)
    throw new ApiError(500, "error_interno", "No se registró la aceptación.");
  return aceptacion;
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
  /** Origen público de la app web (los enlaces del aviso apuntan ahí). */
  origin?: string;
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
    if (ruta === "POST /aviso") {
      const input = kioscoAviso.parse(await request.json());
      const origin = options.origin ?? new URL(request.url).origin;
      return json(200, await avisoPendienteKiosco(options.publico, token, input, origin));
    }
    if (ruta === "POST /aviso/aceptar") {
      const input = kioscoAceptar.parse(await request.json());
      return json(
        201,
        await aceptarEnKiosco(options.publico, token, input, origenDe(request.headers)),
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

/**
 * Purga de fotos de marcaje con más de 90 días. Corre en el servidor con rol de
 * servicio (Storage no permite borrar objetos con SQL directo, así que no puede
 * ser un job de pg_cron). En el evento queda el hash de la foto.
 */
export async function purgarFotos(admin: Db, limite = 500): Promise<{ purgadas: number }> {
  const { data, error } = await admin
    .schema("jornada")
    .rpc("fotos_por_purgar", { p_limite: limite });
  if (error) throw fromDatabase(error);
  const rutas = data.map((fila) => fila.ruta);
  if (rutas.length === 0) return { purgadas: 0 };

  const { error: removeError } = await admin.storage.from("marcajes").remove(rutas);
  if (removeError) throw new ApiError(502, "purga_fallida", "No se pudieron borrar las fotos.");
  return { purgadas: rutas.length };
}
