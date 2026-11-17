// Errores de la API: siempre { codigo, mensaje } con mensaje en español.

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export const noAutenticado = () =>
  new ApiError(401, "no_autenticado", "Inicia sesión para continuar.");
export const noEncontrado = (que: string) =>
  new ApiError(404, "no_encontrado", `${que} no existe o no tienes acceso.`);
export const invalido = (mensaje: string) => new ApiError(422, "datos_invalidos", mensaje);

interface PostgrestLikeError {
  code?: string;
  message: string;
}

/** Los mensajes que lanza la base con `raise exception` ya están en español. */
const MENSAJE_DE_LA_BASE = /^[A-ZÁÉÍÓÚÑ¿¡]/;

/** Traduce un error de PostgREST o Postgres a un error de la API. */
export function fromDatabase(error: PostgrestLikeError): ApiError {
  const propio = MENSAJE_DE_LA_BASE.test(error.message) && !error.message.includes("violates");
  switch (error.code) {
    case "42501":
      return new ApiError(
        403,
        "sin_permiso",
        propio ? error.message : "No tienes permiso para hacer esto.",
      );
    case "23505":
      return new ApiError(
        409,
        "duplicado",
        propio ? error.message : "Ya existe un registro con esos datos.",
      );
    case "23P01":
      return new ApiError(
        409,
        "traslape",
        propio ? error.message : "Las fechas se traslapan con un registro existente.",
      );
    case "23503":
      return new ApiError(
        422,
        "referencia_invalida",
        propio ? error.message : "Uno de los registros referidos no existe.",
      );
    case "23514":
    case "23502":
    case "22P02":
      return new ApiError(
        422,
        "datos_invalidos",
        propio ? error.message : "Los datos no cumplen las reglas del registro.",
      );
    case "23001":
      return new ApiError(409, "inmutable", error.message);
    case "PGRST116":
      return new ApiError(404, "no_encontrado", "El registro no existe o no tienes acceso.");
    default:
      return new ApiError(500, "error_interno", "Ocurrió un error inesperado. Intenta de nuevo.");
  }
}
