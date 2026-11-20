// Reporte para inspección: reúne los datos del periodo, arma el PDF y los CSV, los guarda
// y registra el reporte con las huellas que permiten verificarlo. También el acceso
// temporal del inspector y la verificación pública. Detalle en docs/reportes.md.
import {
  addDays,
  bytesToHex,
  computeWeek,
  isoWeekday,
  merkleRoot,
  mondayOf,
  resolveWorkRules,
  scheduledMinutes,
  sha256,
  uuidV7,
  type Regla,
  type ResumenSemana,
} from "@mijornada/dominio";
import { z } from "zod";
import type { Ctx, Db } from "./context.ts";
import {
  getLogoDataUrl,
  listConsentimientos,
  TITULO_DOCUMENTO,
  type TipoDocumento,
} from "./documentos.ts";
import { ApiError, fromDatabase, invalido, noEncontrado } from "./errors.ts";
import { getEmpresa, listCentros, listTrabajadores, requireTenant } from "./handlers.ts";
import { getDetalleMarcajes, type MarcajeDetalle } from "./incidencias.ts";
import { reporteHtml } from "./reporte-html.ts";

export const TIPOS_REPORTE = ["inspeccion", "periodo", "trabajador"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const TITULO_REPORTE: Record<TipoReporte, string> = {
  inspeccion: "Reporte para inspección",
  periodo: "Reporte de periodo",
  trabajador: "Reporte por trabajador",
};

const fecha = z.iso.date({ error: "Fecha inválida." });

export const reporteCrear = z
  .object({
    tipo: z.enum(TIPOS_REPORTE),
    desde: fecha,
    hasta: fecha,
    centro_id: z.uuid().optional(),
    trabajador_ids: z.array(z.uuid()).min(1).max(200).optional(),
  })
  .refine((r) => r.hasta >= r.desde, {
    message: "El rango de fechas está al revés.",
    path: ["hasta"],
  })
  .refine((r) => r.tipo !== "trabajador" || r.trabajador_ids?.length === 1, {
    message: "El reporte por trabajador es de una sola persona.",
    path: ["trabajador_ids"],
  });
export type ReporteCrear = z.infer<typeof reporteCrear>;

/** Página que se convierte a PDF. El cuerpo ya viene escapado por quien lo arma. */
export interface PaginaPdf {
  titulo: string;
  cuerpoHtml: string;
  /** Línea al pie de cada página, junto al número de página. */
  pie: string;
  /** Logo de la empresa como data URL; si falta, el de Mi Jornada. */
  logo?: string;
  estilos?: string;
}

/** Lo que la API necesita del servidor que la monta: no depende de un navegador concreto. */
export interface Servicios {
  /** Convierte una página HTML a PDF. */
  pdf: (pagina: PaginaPdf) => Promise<Uint8Array>;
  /** Código QR de un texto, como SVG. */
  qr: (texto: string) => Promise<string>;
  /** Cliente con rol de servicio: solo para crear la cuenta del inspector. */
  admin: () => Db;
}

export interface SemanaReporte {
  lunes: string;
  resumen: ResumenSemana;
  jornadaMaxSemanalMin: number;
  topeExtraSemanalMin: number;
}

export interface TrabajadorReporte {
  id: string;
  nombre: string;
  puesto: string | null;
  centro: string;
  zona: string;
  menorDeEdad: boolean;
  dias: {
    fecha: string;
    entrada: string | null;
    salida: string | null;
    pausasMin: number;
    minutosTrabajados: number;
    estado: string;
    medios: string[];
    fotosNoDisponibles: number;
  }[];
  marcajes: MarcajeDetalle[];
  semanas: SemanaReporte[];
  consentimientos: {
    tipo: string;
    version: number;
    aceptado: boolean;
    metodos: string[];
    aceptadoEn: string | null;
  }[];
  cadena: { integra: boolean; nEventos: number; motivo: string | null };
}

export interface DatosReporte {
  id: string;
  tipo: TipoReporte;
  desde: string;
  hasta: string;
  generadoEn: string;
  empresa: { razonSocial: string; rfc: string | null; domicilio: string | null; zona: string };
  /** Nombre del centro al que se limita, o null si son todos. */
  centro: string | null;
  trabajadores: TrabajadorReporte[];
  sellos: { fecha: string; hashRaiz: string; nEventos: number; selladoEn: string }[];
  nEventos: number;
  sincronizacionTardia: number;
  fotosNoDisponibles: number;
  hashRaiz: string;
  hashContenido: string;
}

/** Trae todas las filas de una consulta de PostgREST, que entrega de mil en mil. */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw fromDatabase(error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

const BOM = String.fromCharCode(0xfeff);

const celda = (valor: unknown): string => {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** CSV (RFC 4180) con BOM, para que las hojas de cálculo lean bien los acentos. */
export function toCsv(
  columnas: readonly string[],
  filas: readonly Record<string, unknown>[],
): string {
  const lineas = [
    columnas.join(","),
    ...filas.map((fila) => columnas.map((c) => celda(fila[c])).join(",")),
  ];
  return `${BOM}${lineas.join("\r\n")}\r\n`;
}

/** Columnas de jornada.evento que van al CSV: todas menos la ruta de la foto. */
export const COLUMNAS_EVENTO = [
  "id",
  "tenant_id",
  "trabajador_id",
  "tipo",
  "ts_servidor",
  "ts_dispositivo",
  "ts_declarado",
  "origen",
  "dispositivo_id",
  "client_event_id",
  "lat",
  "lng",
  "precision_m",
  "fuera_de_geocerca",
  "foto_hash",
  "foto_estado",
  "foto_motivo",
  "motivo",
  "referencia_evento_id",
  "creado_por",
  "hash_prev",
  "hash",
  "hash_version",
] as const;

export const COLUMNAS_DIA = [
  "tenant_id",
  "trabajador_id",
  "fecha",
  "entrada",
  "salida",
  "pausas_min",
  "minutos_trabajados",
  "estado",
  "fotos_no_disponibles",
  "recalculado_en",
] as const;

const encoder = new TextEncoder();

interface Generado {
  datos: DatosReporte;
  csvEventos: string;
  csvDias: string;
}

/** Reúne todo lo que lleva el reporte. No escribe nada. */
export async function buildReporte(
  ctx: Ctx,
  input: ReporteCrear,
  ahora: Date = new Date(),
): Promise<Generado> {
  const tenantId = requireTenant(ctx);
  if (addDays(input.desde, 366) < input.hasta)
    throw invalido("El rango debe ser de un año como máximo.");

  const [empresa, centros, todos, reglasDb, estados] = await Promise.all([
    getEmpresa(ctx, tenantId),
    listCentros(ctx),
    listTrabajadores(ctx, { limite: 200 }),
    ctx.db.schema("calculo").from("regla").select("clave, valor, vigente_desde, vigente_hasta"),
    listConsentimientos(ctx),
  ]);
  if (reglasDb.error) throw fromDatabase(reglasDb.error);
  const centro =
    input.centro_id === undefined ? null : centros.find((c) => c.id === input.centro_id);
  if (centro === undefined) throw noEncontrado("El centro");

  const trabajadores = todos.datos.filter(
    (t) =>
      (centro === null || t.centro_id === centro.id) &&
      (input.trabajador_ids === undefined || input.trabajador_ids.includes(t.id)) &&
      t.fecha_alta <= input.hasta &&
      (t.fecha_baja === null || t.fecha_baja >= input.desde),
  );
  if (trabajadores.length === 0) throw invalido("No hay personas en ese alcance y periodo.");
  const ids = trabajadores.map((t) => t.id);

  const zona = empresa.zona_horaria;
  const inicio = `${input.desde} 00:00:00 ${zona}`;
  const fin = `${addDays(input.hasta, 1)} 00:00:00 ${zona}`;
  const lunes = mondayOf(input.desde);
  const domingo = addDays(mondayOf(input.hasta), 6);

  const [eventos, dias, horarios, sellos] = await Promise.all([
    fetchAll((from, to) =>
      ctx.db
        .schema("jornada")
        .from("evento")
        .select("*")
        .in("trabajador_id", ids)
        .gte("ts_servidor", inicio)
        .lt("ts_servidor", fin)
        .order("ts_servidor")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      ctx.db
        .schema("jornada")
        .from("dia_laboral")
        .select("*")
        .in("trabajador_id", ids)
        .gte("fecha", lunes)
        .lte("fecha", domingo)
        .order("fecha")
        .order("trabajador_id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      ctx.db
        .schema("tenants")
        .from("horario")
        .select("trabajador_id, vigente_desde, vigente_hasta, dias, hora_entrada, hora_salida")
        .in("trabajador_id", ids)
        .lte("vigente_desde", domingo)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${lunes}`)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      ctx.db
        .schema("jornada")
        .from("sello_diario")
        .select("fecha, hash_raiz, n_eventos, sellado_en")
        .eq("tenant_id", tenantId)
        .gte("fecha", input.desde)
        .lte("fecha", input.hasta)
        .order("fecha")
        .range(from, to),
    ),
  ]);

  const reglas: Regla[] = reglasDb.data.map((r) => ({
    clave: r.clave,
    valor: r.valor,
    vigenteDesde: r.vigente_desde,
    vigenteHasta: r.vigente_hasta,
  }));

  const porTrabajador: TrabajadorReporte[] = [];
  // De cinco en cinco: cada persona son dos consultas y no hay prisa por saturar la base.
  for (let i = 0; i < trabajadores.length; i += 5) {
    const lote = await Promise.all(
      trabajadores.slice(i, i + 5).map(async (t): Promise<TrabajadorReporte> => {
        const [marcajes, cadena] = await Promise.all([
          getDetalleMarcajes(ctx, { trabajador_id: t.id, desde: input.desde, hasta: input.hasta }),
          ctx.db.schema("jornada").rpc("verificar_cadena", {
            p_tenant_id: tenantId,
            p_trabajador_id: t.id,
            p_desde: inicio,
            p_hasta: fin,
          }),
        ]);
        if (cadena.error) throw fromDatabase(cadena.error);
        const verificacion = cadena.data[0];
        const suyos = dias.filter((d) => d.trabajador_id === t.id);
        const delCentro = centros.find((c) => c.id === t.centro_id);

        const semanas: SemanaReporte[] = [];
        for (let semana = lunes; semana <= domingo; semana = addDays(semana, 7)) {
          const semanaDias = Array.from({ length: 7 }, (_, n) => {
            const dia = addDays(semana, n);
            const horario = horarios.find(
              (h) =>
                h.trabajador_id === t.id &&
                h.vigente_desde <= dia &&
                (h.vigente_hasta === null || h.vigente_hasta >= dia) &&
                Array.isArray(h.dias) &&
                h.dias.includes(isoWeekday(dia)),
            );
            return {
              fecha: dia,
              minutosTrabajados: suyos.find((d) => d.fecha === dia)?.minutos_trabajados ?? 0,
              ...(horario
                ? {
                    minutosJornadaPactada: scheduledMinutes(
                      horario.hora_entrada,
                      horario.hora_salida,
                    ),
                  }
                : {}),
            };
          });
          if (semanaDias.every((d) => d.minutosTrabajados === 0)) continue;
          const vigentes = resolveWorkRules(reglas, semana);
          semanas.push({
            lunes: semana,
            resumen: computeWeek({ dias: semanaDias, menorDeEdad: t.menor_de_edad, reglas }),
            jornadaMaxSemanalMin: vigentes.jornadaMaxSemanalMin,
            topeExtraSemanalMin: t.menor_de_edad
              ? vigentes.topeExtraSemanalMenorMin
              : vigentes.topeExtraSemanalMin,
          });
        }

        return {
          id: t.id,
          nombre: t.nombre,
          puesto: t.puesto,
          centro: delCentro?.nombre ?? "",
          zona: delCentro?.zona_horaria ?? zona,
          menorDeEdad: t.menor_de_edad,
          dias: suyos
            .filter((d) => d.fecha >= input.desde && d.fecha <= input.hasta)
            .map((d) => ({
              fecha: d.fecha,
              entrada: d.entrada,
              salida: d.salida,
              pausasMin: d.pausas_min,
              minutosTrabajados: d.minutos_trabajados,
              estado: d.estado,
              medios: [
                ...new Set(
                  marcajes.filter((m) => m.fecha === d.fecha && !m.anulado).map((m) => m.origen),
                ),
              ],
              fotosNoDisponibles: d.fotos_no_disponibles,
            })),
          marcajes,
          semanas,
          consentimientos: estados
            .filter((e) => e.trabajador_id === t.id)
            .map((e) => ({
              tipo: TITULO_DOCUMENTO[e.tipo as TipoDocumento],
              version: e.version,
              aceptado: e.aceptado,
              metodos: e.metodos,
              aceptadoEn: e.aceptado_en,
            })),
          cadena: {
            integra: verificacion?.integra ?? false,
            nEventos: verificacion?.n_eventos ?? 0,
            motivo: verificacion?.motivo ?? null,
          },
        };
      }),
    );
    porTrabajador.push(...lote);
  }

  const csvEventos = toCsv(COLUMNAS_EVENTO, eventos);
  const csvDias = toCsv(
    COLUMNAS_DIA,
    dias.filter((d) => d.fecha >= input.desde && d.fecha <= input.hasta),
  );

  return {
    datos: {
      id: uuidV7(ahora.getTime()),
      tipo: input.tipo,
      desde: input.desde,
      hasta: input.hasta,
      generadoEn: ahora.toISOString(),
      empresa: {
        razonSocial: empresa.razon_social,
        rfc: empresa.rfc,
        domicilio: empresa.domicilio,
        zona,
      },
      centro: centro?.nombre ?? null,
      trabajadores: porTrabajador,
      sellos: sellos.map((s) => ({
        fecha: s.fecha,
        hashRaiz: s.hash_raiz,
        nEventos: s.n_eventos,
        selladoEn: s.sellado_en,
      })),
      nEventos: eventos.length,
      sincronizacionTardia: eventos.filter((e) => e.origen === "sincronizacion_tardia").length,
      fotosNoDisponibles: eventos.filter(
        (e) => e.foto_estado === "no_disponible" || e.foto_estado === "sin_camara",
      ).length,
      hashRaiz: await merkleRoot(eventos.map((e) => e.hash)),
      hashContenido: bytesToHex(await sha256(encoder.encode(csvEventos))),
    },
    csvEventos,
    csvDias,
  };
}

const REPORTE_COLUMNS =
  "id, tenant_id, tipo, rango, generado_en, hash_contenido, hash_raiz, n_eventos, url_pdf, url_csv, url_csv_dias, centro_id, trabajador_ids, solicitante";

const nuevoToken = () => bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(24)));
const hashToken = async (token: string) => bytesToHex(await sha256(encoder.encode(token)));

/**
 * Genera el reporte: PDF y dos CSV en el bucket `reportes`, y su fila en
 * cumplimiento.reporte. El token de verificación solo queda en el PDF (QR y URL).
 */
export async function createReporte(
  ctx: Ctx,
  input: ReporteCrear,
  servicios: Servicios,
  origin: string,
  ahora: Date = new Date(),
) {
  const tenantId = requireTenant(ctx);
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") {
    throw new ApiError(403, "sin_permiso", "Solo un administrador puede generar reportes.");
  }
  const { datos, csvEventos, csvDias } = await buildReporte(ctx, input, ahora);
  const token = nuevoToken();
  const urlVerificacion = `${origin}/verificar/${token}`;
  const logo = await getLogoDataUrl(ctx, tenantId);

  const pdf = await servicios.pdf({
    titulo: `${TITULO_REPORTE[datos.tipo]} · ${datos.empresa.razonSocial}`,
    cuerpoHtml: reporteHtml(datos, { urlVerificacion, qrSvg: await servicios.qr(urlVerificacion) }),
    pie: `Reporte ${datos.id} · huella del CSV de eventos (SHA-256) ${datos.hashContenido}`,
    ...(logo === null ? {} : { logo }),
  });

  const carpeta = `${tenantId}/${datos.id}`;
  const archivos = [
    { ruta: `${carpeta}/reporte.pdf`, cuerpo: pdf, tipo: "application/pdf" },
    { ruta: `${carpeta}/eventos.csv`, cuerpo: encoder.encode(csvEventos), tipo: "text/csv" },
    { ruta: `${carpeta}/dias.csv`, cuerpo: encoder.encode(csvDias), tipo: "text/csv" },
  ];
  for (const archivo of archivos) {
    const { error } = await ctx.db.storage
      .from("reportes")
      .upload(archivo.ruta, archivo.cuerpo, { contentType: archivo.tipo, upsert: false });
    if (error)
      throw new ApiError(502, "almacenamiento", "No se pudo guardar el reporte. Intenta de nuevo.");
  }

  const { data, error } = await ctx.db.schema("cumplimiento").rpc("registrar_reporte", {
    p_id: datos.id,
    p_tipo: datos.tipo,
    p_desde: datos.desde,
    p_hasta: datos.hasta,
    // Los tipos generados no admiten null en argumentos opcionales de la función.
    p_centro_id: (input.centro_id ?? null) as string,
    p_trabajador_ids: (input.trabajador_ids ?? null) as string[],
    p_hash_contenido: datos.hashContenido,
    p_hash_raiz: datos.hashRaiz,
    p_n_eventos: datos.nEventos,
    p_url_pdf: `${carpeta}/reporte.pdf`,
    p_url_csv: `${carpeta}/eventos.csv`,
    p_url_csv_dias: `${carpeta}/dias.csv`,
    p_token_hash: await hashToken(token),
  });
  if (error) throw fromDatabase(error);
  return { ...data, url_verificacion: urlVerificacion };
}

/** Reportes visibles para quien llama, del más reciente al más antiguo. */
export async function listReportes(ctx: Ctx) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("reporte")
    .select(REPORTE_COLUMNS)
    .order("generado_en", { ascending: false })
    .limit(100);
  if (error) throw fromDatabase(error);
  return data;
}

export async function getReporte(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("reporte")
    .select(REPORTE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("El reporte");
  return data;
}

export const ARCHIVOS_REPORTE = {
  pdf: {
    columna: "url_pdf",
    nombre: "reporte.pdf",
    tipo: "application/pdf",
    accion: "inspector_descarga_pdf",
  },
  eventos: {
    columna: "url_csv",
    nombre: "eventos.csv",
    tipo: "text/csv; charset=utf-8",
    accion: "inspector_descarga_csv_eventos",
  },
  dias: {
    columna: "url_csv_dias",
    nombre: "dias.csv",
    tipo: "text/csv; charset=utf-8",
    accion: "inspector_descarga_csv_dias",
  },
} as const;
export type ArchivoReporte = keyof typeof ARCHIVOS_REPORTE;

/**
 * Descarga un archivo del reporte con los permisos de quien llama (RLS del bucket). Si
 * quien llama es un inspector, la descarga queda en la bitácora.
 */
export async function downloadReporte(
  ctx: Ctx,
  id: string,
  archivo: ArchivoReporte,
  ip: string | null,
) {
  const reporte = await getReporte(ctx, id);
  const spec = ARCHIVOS_REPORTE[archivo];
  const ruta = reporte[spec.columna];
  if (ruta === null) throw noEncontrado("El archivo");
  if (ctx.sesion.rol === "inspector") await logInspector(ctx, id, spec.accion, ip);

  const { data, error } = await ctx.db.storage.from("reportes").download(ruta);
  if (error) throw noEncontrado("El archivo");
  return { cuerpo: new Uint8Array(await data.arrayBuffer()), nombre: spec.nombre, tipo: spec.tipo };
}

async function logInspector(ctx: Ctx, reporteId: string, accion: string, ip: string | null) {
  const { error } = await ctx.db.schema("cumplimiento").rpc("registrar_consulta_inspector", {
    p_reporte_id: reporteId,
    p_accion: accion,
    ...(ip === null ? {} : { p_ip: ip }),
  });
  if (error) throw fromDatabase(error);
}

/** El inspector abre su reporte: queda en la bitácora y recibe el reporte y su verificación. */
export async function openReporteInspector(ctx: Ctx, ip: string | null) {
  if (ctx.sesion.rol !== "inspector")
    throw new ApiError(403, "sin_permiso", "Solo para inspectores.");
  const { data: accesos, error } = await ctx.db
    .schema("cumplimiento")
    .from("acceso_inspector")
    .select("reporte_id, expira_en, revocado_en")
    .is("revocado_en", null)
    .gt("expira_en", new Date().toISOString())
    .limit(1);
  if (error) throw fromDatabase(error);
  const acceso = accesos[0];
  if (acceso === undefined)
    throw new ApiError(403, "acceso_vencido", "Este acceso venció o fue revocado.");

  await logInspector(ctx, acceso.reporte_id, "inspector_abre_reporte", ip);
  const [reporte, verificacion] = await Promise.all([
    getReporte(ctx, acceso.reporte_id),
    verifyReporte(ctx, acceso.reporte_id),
  ]);
  return { reporte, verificacion, expira_en: acceso.expira_en };
}

/** Verifica la cadena de cada persona del reporte. Si llama un inspector, queda en la bitácora. */
export async function verifyReporte(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .rpc("verificar_reporte", { p_reporte_id: id });
  if (error) throw fromDatabase(error);
  return {
    integra: data.every((fila) => fila.integra),
    cadenas: data.length,
    eventos: data.reduce((total, fila) => total + fila.n_eventos, 0),
    rotas: data.filter((fila) => !fila.integra).length,
  };
}

/**
 * Crea un enlace temporal de inspector (72 h, revocable) para un reporte. El enlace solo
 * se muestra una vez: en la base queda su hash.
 */
export async function createAccesoInspector(
  ctx: Ctx,
  reporteId: string,
  servicios: Servicios,
  origin: string,
) {
  await getReporte(ctx, reporteId);
  const admin = servicios.admin();
  const correo = `inspector-${uuidV7()}@inspector.mijornada.xyz`;
  const creada = await admin.auth.admin.createUser({ email: correo, email_confirm: true });
  if (creada.error)
    throw new ApiError(500, "error_interno", "No se pudo crear el acceso. Intenta de nuevo.");

  const token = nuevoToken();
  const { data, error } = await ctx.db.schema("cumplimiento").rpc("crear_acceso_inspector", {
    p_reporte_id: reporteId,
    p_auth_user_id: creada.data.user.id,
    p_token_hash: await hashToken(token),
  });
  if (error) {
    await admin.auth.admin.deleteUser(creada.data.user.id);
    throw fromDatabase(error);
  }
  return { id: data.id, expira_en: data.expira_en, enlace: `${origin}/inspector/${token}` };
}

/** Accesos de inspector de un reporte (vigentes, vencidos y revocados). */
export async function listAccesosInspector(ctx: Ctx, reporteId?: string) {
  let query = ctx.db
    .schema("cumplimiento")
    .from("acceso_inspector")
    .select("id, reporte_id, creado_en, expira_en, revocado_en")
    .order("creado_en", { ascending: false })
    .limit(200);
  if (reporteId !== undefined) query = query.eq("reporte_id", reporteId);
  const { data, error } = await query;
  if (error) throw fromDatabase(error);
  return data;
}

/** Lo que hizo el inspector con un reporte: cuándo lo abrió, lo verificó o descargó, y desde qué IP. */
export async function listConsultasInspector(ctx: Ctx, reporteId: string) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .rpc("consultas_de_inspector", { p_reporte_id: reporteId });
  if (error) throw fromDatabase(error);
  return data as { accion: string; ip: string | null; ts: string }[];
}

export async function revokeAccesoInspector(ctx: Ctx, accesoId: string) {
  const { data, error } = await ctx.db
    .schema("cumplimiento")
    .from("acceso_inspector")
    .update({ revocado_en: new Date().toISOString() })
    .eq("id", accesoId)
    .is("revocado_en", null)
    .select("id, revocado_en");
  if (error) throw fromDatabase(error);
  if (data.length === 0) throw noEncontrado("El acceso");
  return data[0];
}

/**
 * Para el servidor: canjea el token de un enlace de inspector por un token de sesión de un
 * solo uso. Null si el enlace no existe, venció o fue revocado.
 */
export async function loginInspector(
  admin: Db,
  token: string,
): Promise<{ tokenHash: string } | null> {
  const { data, error } = await admin
    .schema("cumplimiento")
    .rpc("acceso_inspector_por_token", { p_token: token });
  if (error) throw fromDatabase(error);
  const acceso = data[0];
  if (acceso === undefined) return null;
  const enlace = await admin.auth.admin.generateLink({ type: "magiclink", email: acceso.correo });
  if (enlace.error) return null;
  return { tokenHash: enlace.data.properties.hashed_token };
}

/** Estado de integridad de un reporte para la página pública. Null si el token no existe. */
export async function getVerificacionPublica(publico: Db, token: string) {
  const { data, error } = await publico
    .schema("cumplimiento")
    .rpc("verificacion_publica", { p_token: token });
  if (error) throw fromDatabase(error);
  return data[0] ?? null;
}
