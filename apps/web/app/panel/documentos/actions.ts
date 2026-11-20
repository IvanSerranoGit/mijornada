"use server";

import {
  ApiError,
  documentoPublicar,
  empresaActualizar,
  publishDocumento,
  registerFirmaAutografa,
  updateEmpresa,
  uploadLogo,
} from "@mijornada/api";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "../../../lib/supabase/server.ts";

export interface Resultado {
  ok?: string;
  error?: string;
}

async function run(
  fn: (ctx: NonNullable<Awaited<ReturnType<typeof getCtx>>>) => Promise<string>,
): Promise<Resultado> {
  const ctx = await getCtx();
  if (ctx === null) return { error: "Inicia sesión para continuar." };
  try {
    const ok = await fn(ctx);
    revalidatePath("/panel", "layout");
    return { ok };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message ?? "Revisa los datos." };
    throw error;
  }
}

const texto = (formData: FormData, nombre: string) => {
  const valor = formData.get(nombre);
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
};

/** Guarda los datos del patrón que aparecen en los documentos. No cambia las versiones ya publicadas. */
export async function guardarDatosLegales(
  _previo: Resultado,
  formData: FormData,
): Promise<Resultado> {
  return run(async (ctx) => {
    if (ctx.sesion.tenantId === null)
      throw new ApiError(409, "sin_empresa", "Tu cuenta no tiene empresa.");
    const datos = empresaActualizar.parse({
      rfc: texto(formData, "rfc")?.toUpperCase() ?? null,
      domicilio: texto(formData, "domicilio"),
      correo_privacidad: texto(formData, "correo_privacidad"),
      telefono_privacidad: texto(formData, "telefono_privacidad"),
    });
    await updateEmpresa(ctx, ctx.sesion.tenantId, datos);
    return "Datos guardados. Para que aparezcan en los documentos, publica una versión nueva.";
  });
}

/** Publica una versión nueva: con el texto pegado o, si viene vacío, con la plantilla de Mi Jornada. */
export async function publicarVersion(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return run(async (ctx) => {
    const contenido = texto(formData, "contenido_md");
    const resumen = texto(formData, "resumen_md");
    const documento = await publishDocumento(
      ctx,
      documentoPublicar.parse({
        tipo: formData.get("tipo"),
        ...(contenido === null ? {} : { contenido_md: contenido }),
        ...(resumen === null ? {} : { resumen_md: resumen }),
      }),
    );
    return `Versión ${String(documento.version)} publicada. Tu equipo debe aceptarla de nuevo.`;
  });
}

const firma = z.object({ trabajador_id: z.uuid(), documento_id: z.uuid() });

/** Sube el logo del negocio; aparece en los PDF de documentos y reportes. */
export async function subirLogo(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return run(async (ctx) => {
    const archivo = formData.get("logo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new ApiError(422, "datos_invalidos", "Elige la imagen del logo.");
    }
    await uploadLogo(ctx, {
      archivo: new Uint8Array(await archivo.arrayBuffer()),
      tipo_mime: archivo.type,
    });
    return "Logo guardado. Aparecerá en tus PDF.";
  });
}

/** Sube el ejemplar con firma autógrafa de una persona. */
export async function subirFirma(_previo: Resultado, formData: FormData): Promise<Resultado> {
  return run(async (ctx) => {
    const datos = firma.parse({
      trabajador_id: formData.get("trabajador_id"),
      documento_id: formData.get("documento_id"),
    });
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new ApiError(422, "datos_invalidos", "Elige el archivo firmado.");
    }
    await registerFirmaAutografa(ctx, {
      ...datos,
      archivo: new Uint8Array(await archivo.arrayBuffer()),
      tipo_mime: archivo.type,
    });
    return "Firma autógrafa guardada.";
  });
}
