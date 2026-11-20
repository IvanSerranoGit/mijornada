// Handlers puros de /api/v1: reciben el cliente de Supabase con la sesión del
// usuario y datos ya validados, y devuelven resultados tipados. Los usan por
// igual los route handlers y las pantallas (server actions).
import {
  addDays,
  computeWeek,
  dateInZone,
  isoWeekday,
  mondayOf,
  resolveWorkRules,
  scheduledMinutes,
  weekStatus,
  type EstadoSemana,
  type Regla,
  type ResumenSemana,
} from "@mijornada/dominio";
import type { Ctx } from "./context.ts";
import { ApiError, fromDatabase, invalido, noEncontrado } from "./errors.ts";
import type {
  CentroActualizar,
  CentroCrear,
  EmpresaActualizar,
  EmpresaCrear,
  EventoCrear,
  HorarioCrear,
  Paginacion,
  TrabajadorActualizar,
  TrabajadorCrear,
  UsuarioActualizar,
} from "./schemas.ts";

export interface Pagina<T> {
  datos: T[];
  /** Cursor para pedir la página siguiente; null si no hay más. */
  siguiente: string | null;
}

function paginate<T extends { id: string }>(rows: T[], limite: number): Pagina<T> {
  const datos = rows.slice(0, limite);
  return { datos, siguiente: rows.length > limite ? (datos.at(-1)?.id ?? null) : null };
}

/** Quita las llaves con valor undefined (Zod las deja en los objetos parciales). */
export function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export function requireTenant(ctx: Ctx): string {
  if (ctx.sesion.tenantId === null) {
    throw new ApiError(409, "sin_empresa", "Tu cuenta todavía no tiene una empresa.");
  }
  return ctx.sesion.tenantId;
}

const TRABAJADOR_COLUMNS =
  "id, tenant_id, centro_id, nombre, puesto, fecha_alta, fecha_baja, tipo_jornada, menor_de_edad, metodo_marcaje, creado_en";
const EVENTO_COLUMNS =
  "id, tenant_id, trabajador_id, tipo, ts_servidor, ts_dispositivo, origen, dispositivo_id, client_event_id, lat, lng, precision_m, foto_url, foto_hash, hash_prev, hash, creado_por, motivo, referencia_evento_id, fuera_de_geocerca";

// ---------------------------------------------------------------- empresas

export async function listEmpresas(ctx: Ctx) {
  const { data, error } = await ctx.db.schema("tenants").from("empresa").select("*").order("id");
  if (error) throw fromDatabase(error);
  return data;
}

export async function getEmpresa(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("La empresa");
  return data;
}

/** Crea la empresa y al usuario que llama como dueño. Después hay que refrescar la sesión. */
export async function createEmpresa(ctx: Ctx, input: EmpresaCrear) {
  const { data, error } = await ctx.db.schema("tenants").rpc("crear_empresa", {
    razon_social: input.razon_social,
    rfc: input.rfc ?? "",
    tamano: input.tamano,
    sector: input.sector ?? "",
    jurisdiccion_sugerida: input.jurisdiccion,
  });
  if (error) throw fromDatabase(error);
  return { id: data };
}

export async function updateEmpresa(ctx: Ctx, id: string, input: EmpresaActualizar) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("empresa")
    .update(defined(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("La empresa");
  return data;
}

// ---------------------------------------------------------------- centros

export async function listCentros(ctx: Ctx) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("centro_trabajo")
    .select("*")
    .order("id");
  if (error) throw fromDatabase(error);
  return data;
}

export async function createCentro(ctx: Ctx, input: CentroCrear) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("centro_trabajo")
    .insert({ ...defined(input), tenant_id: requireTenant(ctx) })
    .select("*")
    .single();
  if (error) throw fromDatabase(error);
  return data;
}

export async function updateCentro(ctx: Ctx, id: string, input: CentroActualizar) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("centro_trabajo")
    .update(defined(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("El centro de trabajo");
  return data;
}

/** Da de alta una tablet de kiosco y devuelve su código de enlace de un solo uso. */
export async function createCodigoEnlace(ctx: Ctx, centroId: string, nombre?: string) {
  const { data, error } = await ctx.db.schema("tenants").rpc("generar_codigo_enlace", {
    centro_id: centroId,
    ...(nombre === undefined ? {} : { nombre }),
  });
  if (error) throw fromDatabase(error);
  return { codigo: data };
}

/** Genera (o reemplaza) el PIN de administrador del kiosco del centro; se muestra una sola vez. */
export async function createPinAdmin(ctx: Ctx, centroId: string) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .rpc("generar_pin_admin", { centro_id: centroId });
  if (error) throw fromDatabase(error);
  return { pin_admin: data };
}

// ---------------------------------------------------------------- trabajadores

export async function listTrabajadores(
  ctx: Ctx,
  { cursor, limite }: Paginacion,
  centroId?: string,
) {
  let query = ctx.db
    .schema("tenants")
    .from("trabajador")
    .select(TRABAJADOR_COLUMNS)
    .order("id")
    .limit(limite + 1);
  if (cursor !== undefined) query = query.gt("id", cursor);
  if (centroId !== undefined) query = query.eq("centro_id", centroId);
  const { data, error } = await query;
  if (error) throw fromDatabase(error);
  return paginate(data, limite);
}

/** Alta con horario opcional. Devuelve el PIN y el token del QR en claro, por única vez. */
export async function createTrabajador(ctx: Ctx, input: TrabajadorCrear) {
  const { data, error } = await ctx.db.schema("tenants").rpc("crear_trabajador", {
    centro_id: input.centro_id,
    nombre: input.nombre,
    menor_de_edad: input.menor_de_edad,
    tipo_jornada: input.tipo_jornada,
    ...(input.puesto ? { puesto: input.puesto } : {}),
    ...(input.curp ? { curp: input.curp } : {}),
    ...(input.nss ? { nss: input.nss } : {}),
    ...(input.horario
      ? {
          dias: input.horario.dias,
          hora_entrada: input.horario.hora_entrada,
          hora_salida: input.horario.hora_salida,
          descanso_semanal: input.horario.descanso_semanal,
        }
      : {}),
  });
  if (error) throw fromDatabase(error);
  const creado = data[0];
  if (creado === undefined)
    throw new ApiError(500, "error_interno", "No se pudo crear el trabajador.");
  return creado;
}

export async function updateTrabajador(ctx: Ctx, id: string, input: TrabajadorActualizar) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("trabajador")
    .update(defined(input))
    .eq("id", id)
    .select(TRABAJADOR_COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("El trabajador");
  return data;
}

export async function regenerateCredenciales(ctx: Ctx, trabajadorId: string) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .rpc("regenerar_credenciales", { trabajador_id: trabajadorId });
  if (error) throw fromDatabase(error);
  const nuevas = data[0];
  if (nuevas === undefined) throw noEncontrado("El trabajador");
  return nuevas;
}

// ---------------------------------------------------------------- usuarios

export async function listUsuarios(ctx: Ctx) {
  const { data, error } = await ctx.db.schema("tenants").from("usuario").select("*").order("id");
  if (error) throw fromDatabase(error);
  return data;
}

export async function updateUsuario(ctx: Ctx, id: string, input: UsuarioActualizar) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("usuario")
    .update(defined(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw fromDatabase(error);
  if (data === null) throw noEncontrado("El usuario");
  return data;
}

// ---------------------------------------------------------------- horarios

export async function listHorarios(ctx: Ctx, trabajadorId: string) {
  const { data, error } = await ctx.db
    .schema("tenants")
    .from("horario")
    .select("*")
    .eq("trabajador_id", trabajadorId)
    .order("vigente_desde", { ascending: false });
  if (error) throw fromDatabase(error);
  return data;
}

/** Un horario nunca se sobreescribe: esto cierra el vigente y crea una versión nueva. */
export async function createHorario(ctx: Ctx, input: HorarioCrear) {
  const { data, error } = await ctx.db.schema("tenants").rpc("crear_horario", {
    trabajador_id: input.trabajador_id,
    vigente_desde: input.vigente_desde,
    dias: input.dias,
    hora_entrada: input.hora_entrada,
    hora_salida: input.hora_salida,
    descanso_semanal: input.descanso_semanal,
  });
  if (error) throw fromDatabase(error);
  return { id: data };
}

// ---------------------------------------------------------------- eventos

export interface ResultadoEvento {
  client_event_id: string;
  /** insertado: es nuevo. existente: ya se había recibido ese client_event_id. */
  estado: "insertado" | "existente" | "rechazado";
  evento?: {
    id: string;
    ts_servidor: string;
    origen: string;
    tipo: string;
    foto_url: string | null;
  };
  error?: { codigo: string; mensaje: string };
}

/**
 * Inserta eventos de marcaje. La base fija ts_servidor, encadena el hash y
 * descarta los client_event_id repetidos; aquí solo se informa qué pasó con cada uno.
 */
export async function createEventos(
  ctx: Ctx,
  input: EventoCrear | EventoCrear[],
): Promise<ResultadoEvento[]> {
  const tenantId = requireTenant(ctx);
  if (ctx.sesion.usuarioId === null) throw invalido("La sesión no tiene un usuario del tenant.");
  const creadoPor = ctx.sesion.usuarioId;
  const eventos = Array.isArray(input) ? input : [input];
  const resultados: ResultadoEvento[] = [];

  // En orden y de uno en uno: la cadena de hashes depende del orden de inserción.
  for (const evento of eventos) {
    const { data, error } = await ctx.db
      .schema("jornada")
      .from("evento")
      .insert({ ...defined(evento), tenant_id: tenantId, creado_por: creadoPor })
      .select("id, ts_servidor, origen, tipo, foto_url");

    if (error) {
      const apiError = fromDatabase(error);
      resultados.push({
        client_event_id: evento.client_event_id,
        estado: "rechazado",
        error: { codigo: apiError.codigo, mensaje: apiError.message },
      });
      continue;
    }

    const insertado = data[0];
    if (insertado !== undefined) {
      resultados.push({
        client_event_id: evento.client_event_id,
        estado: "insertado",
        evento: insertado,
      });
      continue;
    }

    // La base lo descartó por duplicado: se devuelve el que ya existía.
    const { data: existente } = await ctx.db
      .schema("jornada")
      .from("evento")
      .select("id, ts_servidor, origen, tipo, foto_url")
      .eq("trabajador_id", evento.trabajador_id)
      .eq("client_event_id", evento.client_event_id)
      .maybeSingle();
    resultados.push({
      client_event_id: evento.client_event_id,
      estado: "existente",
      ...(existente ? { evento: existente } : {}),
    });
  }

  return resultados;
}

export async function listEventos(
  ctx: Ctx,
  params: Paginacion & {
    trabajador_id: string;
    desde?: string | undefined;
    hasta?: string | undefined;
  },
) {
  let query = ctx.db
    .schema("jornada")
    .from("evento")
    .select(EVENTO_COLUMNS)
    .eq("trabajador_id", params.trabajador_id)
    .order("id")
    .limit(params.limite + 1);
  if (params.cursor !== undefined) query = query.gt("id", params.cursor);
  if (params.desde !== undefined) query = query.gte("ts_servidor", params.desde);
  if (params.hasta !== undefined) query = query.lt("ts_servidor", params.hasta);
  const { data, error } = await query;
  if (error) throw fromDatabase(error);
  return paginate(data, params.limite);
}

// ---------------------------------------------------------------- días y reglas

export async function listDias(
  ctx: Ctx,
  params: { trabajador_id: string; desde: string; hasta: string },
) {
  const { data, error } = await ctx.db
    .schema("jornada")
    .from("dia_laboral")
    .select("*")
    .eq("trabajador_id", params.trabajador_id)
    .gte("fecha", params.desde)
    .lte("fecha", params.hasta)
    .order("fecha");
  if (error) throw fromDatabase(error);
  return data;
}

/** Reglas vigentes en una fecha (por defecto, hoy). */
export async function listReglas(ctx: Ctx, fecha: string = new Date().toISOString().slice(0, 10)) {
  const { data, error } = await ctx.db
    .schema("calculo")
    .from("regla")
    .select("clave, valor, unidad, vigente_desde, vigente_hasta, fuente")
    .lte("vigente_desde", fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`)
    .order("clave");
  if (error) throw fromDatabase(error);
  return data;
}

// ---------------------------------------------------------------- panel del dueño

export interface SemanaTrabajador {
  trabajador: {
    id: string;
    nombre: string;
    puesto: string | null;
    centro_id: string;
    menor_de_edad: boolean;
  };
  /** Último marcaje de hoy, si lo hay. */
  ultimaMarca: { tipo: string; hora: string; origen: string } | null;
  dias: {
    fecha: string;
    minutosTrabajados: number;
    estado: string | null;
    entrada: string | null;
    salida: string | null;
    /** Marcajes del día sin foto por fallo técnico o por falta de cámara. */
    fotosNoDisponibles: number;
  }[];
  resumen: ResumenSemana;
  estado: EstadoSemana;
}

export interface PanelSemanal {
  hoy: string;
  lunes: string;
  zonaHoraria: string;
  centros: {
    id: string;
    nombre: string;
    zona_horaria: string;
    metodo_marcaje: string | null;
    /** El centro pide foto en kiosco y su kiosco vinculado marcó sin cámara. */
    kioscoSinCamara: boolean;
  }[];
  trabajadores: SemanaTrabajador[];
}

/**
 * Semana en curso de cada trabajador visible: días, horas ordinarias y extra
 * contra las reglas vigentes, y el estado que resume sus alertas.
 */
export async function getPanelSemanal(ctx: Ctx, ahora: Date = new Date()): Promise<PanelSemanal> {
  const tenantId = requireTenant(ctx);
  const empresa = await getEmpresa(ctx, tenantId);
  const hoy = dateInZone(ahora, empresa.zona_horaria);
  const lunes = mondayOf(hoy);
  const domingo = addDays(lunes, 6);

  const [centros, trabajadores, horarios, dias, reglas, eventos, sinCamara] = await Promise.all([
    listCentros(ctx),
    listTrabajadores(ctx, { limite: 200 }),
    ctx.db
      .schema("tenants")
      .from("horario")
      .select("trabajador_id, vigente_desde, vigente_hasta, dias, hora_entrada, hora_salida")
      .lte("vigente_desde", domingo)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${lunes}`),
    ctx.db
      .schema("jornada")
      .from("dia_laboral")
      .select("*")
      .gte("fecha", lunes)
      .lte("fecha", domingo),
    ctx.db.schema("calculo").from("regla").select("clave, valor, vigente_desde, vigente_hasta"),
    ctx.db
      .schema("jornada")
      .from("evento")
      .select("trabajador_id, tipo, ts_servidor, ts_dispositivo, origen")
      .in("tipo", ["entrada", "salida", "inicio_pausa", "fin_pausa"])
      .gte("ts_servidor", new Date(ahora.getTime() - 36 * 3_600_000).toISOString())
      .order("ts_servidor", { ascending: false })
      .limit(1000),
    // Kioscos vinculados cuyo último marcaje dijo que no tienen cámara.
    ctx.db
      .schema("tenants")
      .from("dispositivo")
      .select("centro_id")
      .not("vinculado_en", "is", null)
      .is("revocado_en", null)
      .eq("camara_disponible", false),
  ]);
  for (const result of [horarios, dias, reglas, eventos, sinCamara]) {
    if (result.error) throw fromDatabase(result.error);
  }

  const reglasDominio: Regla[] = (reglas.data ?? []).map((r) => ({
    clave: r.clave,
    valor: r.valor,
    vigenteDesde: r.vigente_desde,
    vigenteHasta: r.vigente_hasta,
  }));
  const vigentes = resolveWorkRules(reglasDominio, lunes);

  const semana = trabajadores.datos
    .filter((t) => t.fecha_baja === null || t.fecha_baja >= lunes)
    .map((t): SemanaTrabajador => {
      const diasSemana = Array.from({ length: 7 }, (_, i) => {
        const fecha = addDays(lunes, i);
        const dia = (dias.data ?? []).find((d) => d.trabajador_id === t.id && d.fecha === fecha);
        const horario = (horarios.data ?? []).find(
          (h) =>
            h.trabajador_id === t.id &&
            h.vigente_desde <= fecha &&
            (h.vigente_hasta === null || h.vigente_hasta >= fecha) &&
            Array.isArray(h.dias) &&
            h.dias.includes(isoWeekday(fecha)),
        );
        return {
          fecha,
          minutosTrabajados: dia?.minutos_trabajados ?? 0,
          estado: dia?.estado ?? null,
          entrada: dia?.entrada ?? null,
          salida: dia?.salida ?? null,
          fotosNoDisponibles: dia?.fotos_no_disponibles ?? 0,
          pactada: horario
            ? scheduledMinutes(horario.hora_entrada, horario.hora_salida)
            : undefined,
        };
      });

      const resumen = computeWeek({
        dias: diasSemana.map((d) => ({
          fecha: d.fecha,
          minutosTrabajados: d.minutosTrabajados,
          ...(d.pactada === undefined ? {} : { minutosJornadaPactada: d.pactada }),
        })),
        menorDeEdad: t.menor_de_edad,
        reglas: reglasDominio,
      });

      const ultima = (eventos.data ?? []).find((e) => {
        const hora = new Date(e.ts_dispositivo ?? e.ts_servidor);
        return e.trabajador_id === t.id && dateInZone(hora, empresa.zona_horaria) === hoy;
      });

      return {
        trabajador: {
          id: t.id,
          nombre: t.nombre,
          puesto: t.puesto,
          centro_id: t.centro_id,
          menor_de_edad: t.menor_de_edad,
        },
        ultimaMarca: ultima
          ? {
              tipo: ultima.tipo,
              hora: ultima.ts_dispositivo ?? ultima.ts_servidor,
              origen: ultima.origen,
            }
          : null,
        dias: diasSemana.map((d) => ({
          fecha: d.fecha,
          minutosTrabajados: d.minutosTrabajados,
          estado: d.estado,
          entrada: d.entrada,
          salida: d.salida,
          fotosNoDisponibles: d.fotosNoDisponibles,
        })),
        resumen,
        estado: weekStatus(resumen, vigentes, t.menor_de_edad),
      };
    });

  return {
    hoy,
    lunes,
    zonaHoraria: empresa.zona_horaria,
    centros: centros.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      zona_horaria: c.zona_horaria,
      metodo_marcaje: c.metodo_marcaje,
      kioscoSinCamara: c.foto_en_kiosco && (sinCamara.data ?? []).some((d) => d.centro_id === c.id),
    })),
    trabajadores: semana,
  };
}
