// Contrato de la API `/api/v1`: esquemas Zod, handlers puros y adaptador HTTP.
// Los route handlers y las pantallas importan desde aquí para que ninguna lógica
// de negocio viva solo en una pantalla.

export const API_VERSION = "v1";
export const API_BASE_PATH = `/api/${API_VERSION}`;

export * from "./acceso.ts";
export * from "./context.ts";
export * from "./cuenta.ts";
export * from "./errors.ts";
export * from "./handlers.ts";
export * from "./kiosco.ts";
export * from "./openapi.ts";
export * from "./reporte-html.ts";
export * from "./reportes.ts";
export * from "./router.ts";
export * from "./schemas.ts";
export * from "./documentos.ts";
export * from "./incidencias.ts";
export * from "./pagos.ts";
