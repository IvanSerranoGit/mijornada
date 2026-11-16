// Lógica pura de Mi Jornada: hash encadenado, raíz Merkle y cálculo de horas.
// Este paquete no depende de ningún framework ni de la base de datos.

/** Esquemas de Postgres, uno por dominio. */
export const ESQUEMAS = [
  "tenants",
  "jornada",
  "calculo",
  "cumplimiento",
  "integraciones",
  "auditoria",
] as const;

export type Esquema = (typeof ESQUEMAS)[number];

export * from "./calculo.ts";
export * from "./hash.ts";
export * from "./merkle.ts";
