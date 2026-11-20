// Documentos legales versionados (convenio de registro, aviso de privacidad) y
// consentimiento de los trabajadores. Detalle en docs/documentos-y-consentimiento.md.
import {
  bytesToHex,
  documentHash,
  markdownToHtml,
  pendingVariables,
  renderTemplate,
  sha256,
  type TemplateVars,
} from "@mijornada/dominio";
import { z } from "zod";
import type { Ctx, Db } from "./context.ts";
import { requireCuentaActiva } from "./cuenta.ts";
import { ApiError, fromDatabase, invalido, noEncontrado } from "./errors.ts";
import { requireTenant } from "./handlers.ts";

export const TIPOS_DOCUMENTO = ["convenio_registro", "aviso_privacidad"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TITULO_DOCUMENTO: Record<TipoDocumento, string> = {
  convenio_registro: "Convenio de registro de jornada",
  aviso_privacidad: "Aviso de privacidad",
};

/** Línea para llenar a mano cuando falta un dato. */
const BLANCO = "________________";

/** De dónde viene una aceptación; lo llena el servidor, no el cliente. */
export interface Origen {
  ip: string | null;
  userAgent: string | null;
}

export function origenDe(headers: Headers): Origen {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return {
    ip: /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null,
    userAgent: headers.get("user-agent"),
  };
}

export const documentoPublicar = z
  .object({
    tipo: z.enum(TIPOS_DOCUMENTO),
    /** Texto en Markdown; puede usar las variables de las plantillas. Si falta, se usa la plantilla de Mi Jornada. */
    contenido_md: z.string().trim().min(200, "El texto es demasiado corto.").max(60_000).optional(),
    /** Aviso simplificado; solo en el aviso de privacidad. */
    resumen_md: z.string().trim().min(50).max(4_000).optional(),
  })
  .refine(
    (d) =>
      d.contenido_md === undefined || d.tipo !== "aviso_privacidad" || d.resumen_md !== undefined,
    "El aviso de privacidad necesita también su versión simplificada.",
  );
export type DocumentoPublicar = z.infer<typeof documentoPublicar>;

export const documentoAceptar = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre completo.").max(200),
});

interface EmpresaLegal {
  razon_social: string;
  rfc: string | null;
  domicilio: string | null;
  correo_privacidad: string | null;
  telefono_privacidad: string | null;
  zona_horaria: string;
}

interface CentroLegal {
  id: string;
  nombre: string;
  metodo_marcaje: string | null;
  foto_en_kiosco: boolean;
  foto_en_telefono: boolean;
}

const fechaLarga = (fecha: Date, zona: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: zona }).format(fecha);

/** Variables que se resuelven al publicar la versión (entran al contenido_hash). */
export function varsEmpresa(empresa: EmpresaLegal, version: number, hoy: Date): TemplateVars {
  return {
    razon_social: empresa.razon_social,
    rfc_patron: empresa.rfc ?? BLANCO,
    domicilio_patron: empresa.domicilio ?? BLANCO,
    correo_privacidad: empresa.correo_privacidad ?? BLANCO,
    telefono_privacidad: empresa.telefono_privacidad ?? BLANCO,
    fecha_actualizacion: fechaLarga(hoy, empresa.zona_horaria),
    version_documento: String(version),
  };
}

/** Datos de la empresa que faltan y dejarían líneas en blanco en los documentos. */
export function datosLegalesFaltantes(empresa: EmpresaLegal): string[] {
  return [
    empresa.rfc === null ? "RFC" : null,
    empresa.domicilio === null ? "domicilio" : null,
    empresa.correo_privacidad === null ? "correo de privacidad" : null,
    empresa.telefono_privacidad === null ? "teléfono de privacidad" : null,
  ].filter((dato): dato is string => dato !== null);
}

const usaKiosco = (c: CentroLegal) => c.metodo_marcaje !== "telefono";
const usaTelefono = (c: CentroLegal) => c.metodo_marcaje !== "kiosco";

/** Variables que dependen del centro: se resuelven al mostrar el documento. */
export function varsCentro(centro: CentroLegal, origin: string): TemplateVars {
  const kiosco = "el kiosco del centro de trabajo, con su PIN o su código QR";
  const telefono = "la aplicación Mi Jornada en su teléfono celular";
  return {
    centro_trabajo: centro.nombre,
    metodo_marcaje:
      usaKiosco(centro) && usaTelefono(centro)
        ? `${kiosco}, o ${telefono}`
        : usaKiosco(centro)
          ? kiosco
          : telefono,
    captura_foto:
      (usaKiosco(centro) && centro.foto_en_kiosco) ||
      (usaTelefono(centro) && centro.foto_en_telefono),
    captura_ubicacion: usaTelefono(centro),
    url_aviso_integral: `${origin}/aviso/${centro.id}`,
  };
}

/** Variables de la persona. Sin `aceptacion`, la fecha queda en blanco (ejemplar para firmar). */
export function varsTrabajador(
  trabajador: { nombre: string; puesto: string | null },
  documento: { contenido_hash: string },
  aceptadoEn: string | null,
  zona: string,
): TemplateVars {
  return {
    nombre_trabajador: trabajador.nombre,
    // La CURP se guarda cifrada y es opcional: en el ejemplar impreso se llena a mano.
    curp_trabajador: BLANCO,
    puesto: trabajador.puesto ?? BLANCO,
    hash_documento: documento.contenido_hash,
    fecha: aceptadoEn === null ? BLANCO : fechaLarga(new Date(aceptadoEn), zona),
  };
}

/** Ejemplar en blanco: los datos de la persona quedan como líneas para llenar a mano. */
export function varsEnBlanco(documento: { contenido_hash: string }): TemplateVars {
  return {
    nombre_trabajador: BLANCO,
    curp_trabajador: BLANCO,
    puesto: BLANCO,
    hash_documento: documento.contenido_hash,
    fecha: BLANCO,
  };
}

async function getEmpresaLegal(ctx: Ctx, tenantId: string): Promise<EmpresaLegal> {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("razon_social, rfc, domicilio, correo_privacidad, telefono_privacidad, zona_horaria")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("La empresa");
  return data;
}

const DOCUMENTO_COLUMNS =
  "id, tenant_id, tipo, version, contenido_hash, contenido_md, resumen_md, plantilla_version, url_pdf, vigente_desde, creado_en";

/** Todas las versiones de los documentos del tenant, de la más reciente a la más antigua. */
export async function listDocumentos(ctx: Ctx) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("documento")
    .select(DOCUMENTO_COLUMNS)
    .eq("tenant_id", requireTenant(ctx))
    .order("tipo")
    .order("version", { ascending: false });
  if (error) throw fromDatabase(error);
  return data;
}

export async function getDocumento(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("documento")
    .select(DOCUMENTO_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("El documento");
  return data;
}

/**
 * Publica una versión nueva de un documento. Con `contenido_md` se usa ese texto (por
 * ejemplo, el del abogado); sin él, la plantilla vigente de Mi Jornada. En ambos casos se
 * renderiza con los datos de la empresa y sobre ese texto se calcula `contenido_hash`.
 * Los consentimientos de la versión anterior dejan de contar.
 */
export async function publishDocumento(ctx: Ctx, input: DocumentoPublicar, hoy: Date = new Date()) {
  await requireCuentaActiva(ctx);
  const tenantId = requireTenant(ctx);
  const empresa = await getEmpresaLegal(ctx, tenantId);

  let fuente: { contenido_md: string; resumen_md: string | null; plantilla_version: string | null };
  if (input.contenido_md === undefined) {
    const { data, error } = await ctx.db
      .schema("cumplimiento")
      .from("plantilla")
      .select("version, contenido_md, resumen_md, creado_en")
      .eq("tipo", input.tipo)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw fromDatabase(error);
    if (data === null)
      throw new ApiError(500, "error_interno", "Falta la plantilla del documento.");
    fuente = {
      contenido_md: data.contenido_md,
      resumen_md: data.resumen_md,
      plantilla_version: data.version,
    };
  } else {
    fuente = {
      contenido_md: `${input.contenido_md}\n`,
      resumen_md: input.tipo === "aviso_privacidad" ? `${input.resumen_md ?? ""}\n` : null,
      plantilla_version: null,
    };
  }

  const { data: ultima, error: ultimaError } = await ctx.db
    .schema("cumplimiento")
    .from("documento")
    .select("version")
    .eq("tenant_id", tenantId)
    .eq("tipo", input.tipo)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimaError) throw fromDatabase(ultimaError);
  const version = (ultima?.version ?? 0) + 1;

  const vars = varsEmpresa(empresa, version, hoy);
  const contenido = renderTemplate(fuente.contenido_md, vars);
  const resumen = fuente.resumen_md === null ? null : renderTemplate(fuente.resumen_md, vars);
  const desconocidas = pendingVariables(`${contenido}${resumen ?? ""}`).filter(
    (v) => !VARIABLES_AL_MOSTRAR.has(v),
  );
  if (desconocidas.length > 0) {
    throw invalido(`El texto usa variables que no existen: ${desconocidas.join(", ")}.`);
  }

  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("documento")
    .insert({
      tenant_id: tenantId,
      tipo: input.tipo,
      version,
      contenido_md: contenido,
      resumen_md: resumen,
      contenido_hash: await documentHash(contenido, resumen),
      plantilla_version: fuente.plantilla_version,
      vigente_desde: new Intl.DateTimeFormat("en-CA", { timeZone: empresa.zona_horaria }).format(
        hoy,
      ),
      creado_por: ctx.sesion.usuarioId,
    })
    .select(DOCUMENTO_COLUMNS)
    .single();
  if (error) throw fromDatabase(error);
  return data;
}

/** Variables que se quedan en el texto guardado y se resuelven para cada persona. */
const VARIABLES_AL_MOSTRAR = new Set([
  "centro_trabajo",
  "metodo_marcaje",
  "captura_foto",
  "captura_ubicacion",
  "url_aviso_integral",
  "nombre_trabajador",
  "curp_trabajador",
  "puesto",
  "hash_documento",
  "fecha",
]);

/** Crea la versión 1 de cada documento que la empresa todavía no tenga. Idempotente. */
export async function ensureDocumentos(ctx: Ctx, hoy: Date = new Date()) {
  const existentes = await listDocumentos(ctx);
  for (const tipo of TIPOS_DOCUMENTO) {
    if (existentes.some((d) => d.tipo === tipo)) continue;
    try {
      await publishDocumento(ctx, { tipo }, hoy);
    } catch (error) {
      // Otra petición la creó al mismo tiempo: ya existe, que es lo que se quería.
      if (!(error instanceof ApiError && error.status === 409)) throw error;
    }
  }
  return listDocumentos(ctx);
}

export interface EstadoConsentimiento {
  trabajador_id: string;
  documento_id: string;
  tipo: string;
  version: number;
  aceptado: boolean;
  metodos: string[];
  aceptado_en: string | null;
}

/** Por trabajador activo y documento vigente: si lo aceptó, cómo y cuándo. */
export async function listConsentimientos(ctx: Ctx): Promise<EstadoConsentimiento[]> {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .rpc("estado_consentimientos", { p_tenant_id: requireTenant(ctx) });
  if (error) throw fromDatabase(error);
  return data;
}

export interface DocumentoParaAceptar {
  id: string;
  tipo: TipoDocumento;
  titulo: string;
  version: number;
  contenido_hash: string;
  /** Texto completo, ya con los datos de la persona y de su centro. */
  contenido_html: string;
  /** Aviso simplificado (solo el aviso de privacidad). */
  resumen_html: string | null;
  aceptado: boolean;
  metodos: string[];
  aceptado_en: string | null;
}

/** Documentos vigentes del trabajador que llama, listos para leer, con su estado. */
export async function getMisDocumentos(
  ctx: Ctx,
  origin: string,
): Promise<{ nombre: string; documentos: DocumentoParaAceptar[] }> {
  const tenantId = requireTenant(ctx);
  const trabajadorId = ctx.sesion.trabajadorId;
  if (trabajadorId === null) throw new ApiError(403, "sin_permiso", "Solo para trabajadores.");

  const [vigentes, estados, trabajador, empresa] = await Promise.all([
    ctx.db.schema("cumplimiento").rpc("documentos_vigentes", { p_tenant_id: tenantId }),
    listConsentimientos(ctx),
    ctx.db
      .schema("tenants")
      .from("trabajador")
      .select("nombre, puesto, centro_id")
      .eq("id", trabajadorId)
      .single(),
    getEmpresaLegal(ctx, tenantId),
  ]);
  if (vigentes.error) throw fromDatabase(vigentes.error);
  if (trabajador.error) throw fromDatabase(trabajador.error);
  const { data: centro, error: centroError } = await ctx.db
    .schema("tenants")
    .from("centro_trabajo")
    .select("id, nombre, metodo_marcaje, foto_en_kiosco, foto_en_telefono")
    .eq("id", trabajador.data.centro_id)
    .single();
  if (centroError) throw fromDatabase(centroError);

  const documentos = vigentes.data
    .filter((d): d is typeof d & { tipo: TipoDocumento } =>
      (TIPOS_DOCUMENTO as readonly string[]).includes(d.tipo),
    )
    .map((d): DocumentoParaAceptar => {
      const estado = estados.find(
        (e) => e.trabajador_id === trabajadorId && e.documento_id === d.id,
      );
      const vars = {
        ...varsCentro(centro, origin),
        ...varsTrabajador(trabajador.data, d, estado?.aceptado_en ?? null, empresa.zona_horaria),
      };
      return {
        id: d.id,
        tipo: d.tipo,
        titulo: TITULO_DOCUMENTO[d.tipo],
        version: d.version,
        contenido_hash: d.contenido_hash,
        contenido_html: markdownToHtml(renderTemplate(d.contenido_md ?? "", vars)),
        resumen_html:
          d.resumen_md === null ? null : markdownToHtml(renderTemplate(d.resumen_md, vars)),
        aceptado: estado?.aceptado ?? false,
        metodos: estado?.metodos ?? [],
        aceptado_en: estado?.aceptado_en ?? null,
      };
    });
  return { nombre: trabajador.data.nombre, documentos };
}

/** Firma simple: el trabajador acepta la versión vigente tecleando su nombre completo. */
export async function acceptDocumento(
  ctx: Ctx,
  documentoId: string,
  nombre: string,
  origen: Origen,
) {
  const { data, error } = await ctx.db.schema("cumplimiento").rpc("aceptar_documento", {
    p_documento_id: documentoId,
    p_nombre: nombre,
    ...(origen.ip === null ? {} : { p_ip: origen.ip }),
    ...(origen.userAgent === null ? {} : { p_user_agent: origen.userAgent }),
  });
  if (error) throw fromDatabase(error);
  const aceptacion = data[0];
  if (aceptacion === undefined)
    throw new ApiError(500, "error_interno", "No se registró la aceptación.");
  return aceptacion;
}

const TIPOS_DE_ARCHIVO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Firma autógrafa: el patrón sube el ejemplar firmado (escaneado o fotografiado). Se guarda
 * en el bucket documentos y queda asociado al consentimiento con el hash del archivo.
 */
export async function registerFirmaAutografa(
  ctx: Ctx,
  input: { trabajador_id: string; documento_id: string; archivo: Uint8Array; tipo_mime: string },
) {
  const tenantId = requireTenant(ctx);
  const extension = TIPOS_DE_ARCHIVO[input.tipo_mime];
  if (extension === undefined) throw invalido("Sube un PDF o una imagen (JPG, PNG o WebP).");
  if (input.archivo.byteLength === 0 || input.archivo.byteLength > 10 * 1024 * 1024) {
    throw invalido("El archivo debe pesar menos de 10 MB.");
  }
  const documento = await getDocumento(ctx, input.documento_id);
  const archivoHash = bytesToHex(await sha256(input.archivo));
  const ruta = `${tenantId}/firmas/${documento.id}/${input.trabajador_id}-${archivoHash.slice(0, 12)}.${extension}`;

  const { error: subida } = await ctx.db.storage
    .from("documentos")
    .upload(ruta, input.archivo, { contentType: input.tipo_mime, upsert: false });
  if (subida && !/exist/i.test(subida.message)) {
    throw new ApiError(502, "almacenamiento", "No se pudo guardar el archivo. Intenta de nuevo.");
  }

  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("consentimiento")
    .insert({
      tenant_id: tenantId,
      trabajador_id: input.trabajador_id,
      documento_id: documento.id,
      metodo: "firma_autografa",
      archivo_url: ruta,
      archivo_hash: archivoHash,
      registrado_por: ctx.sesion.usuarioId,
    })
    .select("id, aceptado_en, archivo_hash")
    .single();
  if (error) throw fromDatabase(error);
  return data;
}

const TIPOS_DE_LOGO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Guarda el logo de la empresa (bucket documentos); aparece en los PDF. */
export async function uploadLogo(ctx: Ctx, input: { archivo: Uint8Array; tipo_mime: string }) {
  await requireCuentaActiva(ctx);
  const tenantId = requireTenant(ctx);
  const extension = TIPOS_DE_LOGO[input.tipo_mime];
  if (extension === undefined) throw invalido("El logo debe ser una imagen PNG, JPG o WebP.");
  if (input.archivo.byteLength === 0 || input.archivo.byteLength > 1024 * 1024) {
    throw invalido("El logo debe pesar menos de 1 MB.");
  }
  // El nombre lleva la huella del archivo: cambiar de logo no sobrescribe el anterior.
  const huella = bytesToHex(await sha256(input.archivo)).slice(0, 12);
  const ruta = `${tenantId}/logo-${huella}.${extension}`;
  const { error: subida } = await ctx.db.storage
    .from("documentos")
    .upload(ruta, input.archivo, { contentType: input.tipo_mime, upsert: false });
  if (subida && !/exist/i.test(subida.message)) {
    throw new ApiError(502, "almacenamiento", "No se pudo guardar el logo. Intenta de nuevo.");
  }
  const { error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .update({ logo_url: ruta })
    .eq("id", tenantId);
  if (error) throw fromDatabase(error);
  return { logo_url: ruta };
}

/** Logo de la empresa como data URL para incrustarlo en un PDF; null si no cargó uno. */
export async function getLogoDataUrl(ctx: Ctx, tenantId: string): Promise<string | null> {
  const { data: empresa } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("logo_url")
    .eq("id", tenantId)
    .maybeSingle();
  if (!empresa?.logo_url) return null;
  const { data: archivo } = await ctx.db.storage.from("documentos").download(empresa.logo_url);
  if (!archivo) return null;
  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  return `data:${archivo.type};base64,${base64}`;
}

/** Aviso de privacidad integral vigente de un centro, para la página pública. */
export async function getAvisoPublico(publico: Db, centroId: string, origin: string) {
  const { data, error } = await publico
    .schema("cumplimiento")
    .rpc("aviso_publico", { p_centro_id: centroId });
  if (error) throw fromDatabase(error);
  const aviso = data[0];
  if (aviso === undefined) return null;
  const vars = varsCentro({ id: centroId, nombre: "", ...aviso }, origin);
  return {
    razon_social: aviso.razon_social,
    version: aviso.version,
    vigente_desde: aviso.vigente_desde,
    contenido_html: markdownToHtml(renderTemplate(aviso.contenido_md, vars)),
  };
}

export interface DocumentoImprimible {
  tenant_id: string;
  titulo: string;
  razon_social: string;
  version: number;
  contenido_hash: string;
  /** Cuerpo del documento en HTML (sin la página). */
  contenido_html: string;
}

/**
 * Documento listo para imprimir. Con `trabajadorId` lleva los datos de esa persona; sin
 * él, líneas en blanco para llenar a mano. Solo para quien puede ver el documento.
 */
export async function getDocumentoImprimible(
  ctx: Ctx,
  documentoId: string,
  origin: string,
  trabajadorId?: string,
): Promise<DocumentoImprimible> {
  const documento = await getDocumento(ctx, documentoId);
  const empresa = await getEmpresaLegal(ctx, documento.tenant_id);
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(documento.tipo))
    throw noEncontrado("El documento");

  let centroId: string | undefined;
  let vars: TemplateVars = varsEnBlanco(documento);
  if (trabajadorId !== undefined) {
    const { data: trabajador, error } = await ctx.db
      .schema("tenants")
      .from("trabajador")
      .select("nombre, puesto, centro_id")
      .eq("id", trabajadorId)
      .maybeSingle();
    if (error) throw fromDatabase(error);
    if (trabajador === null) throw noEncontrado("El trabajador");
    centroId = trabajador.centro_id;
    vars = varsTrabajador(trabajador, documento, null, empresa.zona_horaria);
  }

  let centros = ctx.db
    .schema("tenants")
    .from("centro_trabajo")
    .select("id, nombre, metodo_marcaje, foto_en_kiosco, foto_en_telefono")
    .eq("tenant_id", documento.tenant_id)
    .order("id")
    .limit(1);
  if (centroId !== undefined) centros = centros.eq("id", centroId);
  const { data: centro, error: centroError } = await centros.maybeSingle();
  if (centroError) throw fromDatabase(centroError);
  if (centro === null)
    throw invalido("Da de alta un centro de trabajo antes de imprimir documentos.");

  const texto = renderTemplate(documento.contenido_md ?? "", {
    ...varsCentro(centro, origin),
    ...(trabajadorId === undefined ? { centro_trabajo: BLANCO } : {}),
    ...vars,
  });
  return {
    tenant_id: documento.tenant_id,
    titulo: TITULO_DOCUMENTO[documento.tipo as TipoDocumento],
    razon_social: empresa.razon_social,
    version: documento.version,
    contenido_hash: documento.contenido_hash,
    contenido_html: markdownToHtml(texto),
  };
}
