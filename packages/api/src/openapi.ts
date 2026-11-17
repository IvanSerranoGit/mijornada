// Genera el documento OpenAPI 3.1 desde la tabla de rutas y sus esquemas Zod.
import { z } from "zod";
import { RUTAS } from "./router.ts";

const ERROR_SCHEMA = {
  type: "object",
  required: ["codigo", "mensaje"],
  properties: {
    codigo: { type: "string", examples: ["datos_invalidos"] },
    mensaje: { type: "string", description: "Mensaje en español para mostrar a la persona." },
  },
};

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return Object.fromEntries(Object.entries(generated).filter(([key]) => key !== "$schema"));
}

export function buildOpenApi(serverUrl = "/api/v1"): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ruta of RUTAS) {
    const parameters: unknown[] = [...ruta.ruta.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    }));

    if (ruta.query) {
      const schema = jsonSchema(ruta.query) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        parameters.push({
          name,
          in: "query",
          required: schema.required?.includes(name) ?? false,
          schema: property,
        });
      }
    }

    const operation: Record<string, unknown> = {
      summary: ruta.resumen,
      tags: [ruta.etiqueta],
      parameters,
      responses: {
        [String(ruta.status ?? 200)]: { description: "Correcto" },
        default: {
          description: "Error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    };
    if (ruta.body) {
      operation["requestBody"] = {
        required: true,
        content: { "application/json": { schema: jsonSchema(ruta.body) } },
      };
    }

    (paths[ruta.ruta] ??= {})[ruta.metodo.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Mi Jornada API",
      version: "1.0.0",
      description:
        "API de registro de jornada. JSON, fechas ISO 8601 en UTC, paginación por cursor y errores { codigo, mensaje } en español.",
    },
    servers: [{ url: serverUrl }],
    security: [{ sesion: [] }],
    paths,
    components: {
      schemas: { Error: ERROR_SCHEMA },
      securitySchemes: {
        sesion: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Sesión de Supabase Auth (cookie en web y PWA, o Authorization: Bearer).",
        },
      },
    },
  };
}
