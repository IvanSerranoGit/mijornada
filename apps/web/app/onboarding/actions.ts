"use server";

import {
  ApiError,
  centroActualizar,
  centroCrear,
  createCentro,
  createCodigoEnlace,
  createEmpresa,
  createTrabajador,
  empresaActualizar,
  empresaCrear,
  trabajadorCrear,
  updateCentro,
  updateEmpresa,
  type Ctx,
  ensureDocumentos,
} from "@mijornada/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { getCtx } from "../../lib/supabase/server.ts";

export interface FormState {
  error?: string;
}

async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/onboarding");
  return ctx;
}

/** Convierte cualquier error en un mensaje en español para el formulario. */
function mensaje(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Revisa los datos.";
  throw error;
}

const text = (formData: FormData, name: string): string | null => {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};
const number = (formData: FormData, name: string): number | null => {
  const value = text(formData, name);
  return value === null ? null : Number(value);
};

// ---------------------------------------------------------------- paso 2: empresa

export async function guardarEmpresa(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const datos = {
    razon_social: text(formData, "razon_social") ?? "",
    rfc: text(formData, "rfc"),
    tamano: text(formData, "tamano"),
    sector: text(formData, "sector"),
    jurisdiccion: text(formData, "jurisdiccion"),
  };
  // Opcionales: si faltan, los documentos dejan una línea en blanco y el panel lo avisa.
  const legales = {
    domicilio: text(formData, "domicilio") ?? null,
    correo_privacidad: text(formData, "correo_privacidad") ?? null,
  };
  try {
    if (ctx.sesion.tenantId === null) {
      const legalesValidos = empresaActualizar.parse(legales);
      const { id } = await createEmpresa(ctx, empresaCrear.parse(datos));
      // La sesión nueva trae los claims del tenant recién creado.
      const { error } = await ctx.db.auth.refreshSession();
      if (error) return { error: "La empresa se creó, pero hay que volver a iniciar sesión." };
      await updateEmpresa(ctx, id, legalesValidos);
    } else {
      await updateEmpresa(
        ctx,
        ctx.sesion.tenantId,
        empresaActualizar.parse({ ...datos, ...legales }),
      );
    }
  } catch (error) {
    return { error: mensaje(error) };
  }
  redirect("/onboarding?paso=3");
}

// ---------------------------------------------------------------- paso 3: centro

export interface Geocodificacion {
  error?: string;
  lat?: number;
  lng?: number;
  encontrado?: string;
}

/** Busca la dirección en Nominatim (OpenStreetMap). Es opcional: se puede capturar a mano. */
export async function buscarDireccion(direccion: string): Promise<Geocodificacion> {
  await requireCtx();
  if (direccion.trim().length < 5) return { error: "Escribe la dirección completa." };
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: direccion,
      format: "jsonv2",
      limit: "1",
      countrycodes: "mx",
    }).toString();
    const response = await fetch(url, {
      headers: { "User-Agent": "mijornada-geocodificacion/1.0", "Accept-Language": "es" },
      signal: AbortSignal.timeout(6000),
    });
    const resultados = z
      .array(z.object({ lat: z.coerce.number(), lon: z.coerce.number(), display_name: z.string() }))
      .parse(await response.json());
    const primero = resultados[0];
    if (primero === undefined)
      return { error: "No encontramos esa dirección. Puedes capturar la ubicación a mano." };
    return { lat: primero.lat, lng: primero.lon, encontrado: primero.display_name };
  } catch {
    return { error: "No se pudo buscar la dirección. Puedes capturar la ubicación a mano." };
  }
}

export async function guardarCentro(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const datos = {
    nombre: text(formData, "nombre") ?? "",
    direccion: text(formData, "direccion"),
    lat: number(formData, "lat"),
    lng: number(formData, "lng"),
    radio_m: number(formData, "radio_m"),
    zona_horaria: text(formData, "zona_horaria") ?? "America/Mexico_City",
  };
  try {
    const id = text(formData, "id");
    if (id === null) {
      await createCentro(ctx, centroCrear.parse(datos));
    } else {
      await updateCentro(ctx, id, centroActualizar.parse(datos));
    }
  } catch (error) {
    return { error: mensaje(error) };
  }
  redirect("/onboarding?paso=4");
}

// ---------------------------------------------------------------- paso 4: trabajadores

export interface Credenciales {
  nombre: string;
  pin: string;
  /** QR del trabajador como imagen (data URL). */
  qr: string;
}

export interface TrabajadorState extends FormState {
  /** Credenciales del trabajador recién creado: se muestran una sola vez. */
  credenciales?: Credenciales;
}

export async function agregarTrabajador(
  _prev: TrabajadorState,
  formData: FormData,
): Promise<TrabajadorState> {
  const ctx = await requireCtx();
  const dias = formData.getAll("dias").map(Number);
  try {
    const datos = trabajadorCrear.parse({
      centro_id: text(formData, "centro_id") ?? "",
      nombre: text(formData, "nombre") ?? "",
      puesto: text(formData, "puesto"),
      menor_de_edad: formData.get("menor_de_edad") === "on",
      curp: text(formData, "curp"),
      nss: text(formData, "nss"),
      horario: {
        dias,
        hora_entrada: text(formData, "hora_entrada") ?? "",
        hora_salida: text(formData, "hora_salida") ?? "",
        descanso_semanal: formData.getAll("descanso_semanal").map(Number),
      },
    });
    const creado = await createTrabajador(ctx, datos);
    revalidatePath("/onboarding");
    return {
      credenciales: {
        nombre: datos.nombre,
        pin: creado.pin,
        qr: await QRCode.toDataURL(creado.qr_token, { margin: 1, width: 240 }),
      },
    };
  } catch (error) {
    return { error: mensaje(error) };
  }
}

// ---------------------------------------------------------------- paso 5: método de marcaje

export interface MetodoState extends FormState {
  /** Códigos de enlace recién generados, por centro: se muestran una sola vez. */
  codigos?: { centro: string; codigo: string }[];
  guardado?: boolean;
}

export async function guardarMetodos(_prev: MetodoState, formData: FormData): Promise<MetodoState> {
  const ctx = await requireCtx();
  const codigos: { centro: string; codigo: string }[] = [];
  try {
    for (const centroId of formData.getAll("centro_id").map(String)) {
      const metodo = centroActualizar.shape.metodo_marcaje
        .unwrap()
        .parse(text(formData, `metodo_${centroId}`));
      const centro = await updateCentro(ctx, centroId, {
        metodo_marcaje: metodo,
        foto_en_kiosco: formData.get(`foto_kiosco_${centroId}`) === "on",
        foto_en_telefono: formData.get(`foto_telefono_${centroId}`) === "on",
      });
      // Solo se genera código si el centro usa kiosco y todavía no tiene una tablet dada de alta.
      if (metodo !== "telefono" && formData.get(`tiene_kiosco_${centroId}`) !== "1") {
        const { codigo } = await createCodigoEnlace(ctx, centroId);
        codigos.push({ centro: centro.nombre, codigo });
      }
    }
  } catch (error) {
    return {
      error: error instanceof z.ZodError ? "Elige cómo se marca en cada centro." : mensaje(error),
    };
  }
  revalidatePath("/onboarding");
  return { codigos, guardado: true };
}

export async function generarCodigoEnlace(
  centroId: string,
): Promise<{ codigo?: string; error?: string }> {
  const ctx = await requireCtx();
  try {
    return await createCodigoEnlace(ctx, centroId);
  } catch (error) {
    return { error: mensaje(error) };
  }
}

// ---------------------------------------------------------------- paso 6: empezar

export async function terminarOnboarding(): Promise<void> {
  const ctx = await requireCtx();
  if (ctx.sesion.tenantId !== null) {
    await updateEmpresa(ctx, ctx.sesion.tenantId, {
      onboarding_completado_en: new Date().toISOString(),
    });
    // La empresa nace con su convenio y su aviso de privacidad (versión 1 de las plantillas).
    await ensureDocumentos(ctx);
  }
  redirect("/panel");
}
