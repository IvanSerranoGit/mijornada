// Genera supabase/seeds/0002_plantillas_legales.sql a partir de docs/legal.
// Ejecutar con `pnpm db:seed:legal` cada vez que cambie un archivo de docs/legal;
// una prueba de packages/db falla si el seed y los archivos no coinciden.
import { parseLegalTemplate } from "@mijornada/dominio";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");

export const ARCHIVOS_LEGALES = {
  convenio: "docs/legal/convenio-registro-jornada-v0.9.md",
  aviso: "docs/legal/aviso-privacidad-integral-v0.9.md",
  resumen: "docs/legal/aviso-privacidad-simplificado-v0.9.md",
} as const;

export interface PlantillaLegal {
  tipo: string;
  version: string;
  contenido_md: string;
  resumen_md: string | null;
}

/** Las plantillas tal como deben quedar en cumplimiento.plantilla. */
export async function readLegalTemplates(): Promise<PlantillaLegal[]> {
  const read = async (file: string) =>
    parseLegalTemplate(await readFile(path.join(root, file), "utf8"));
  const [convenio, aviso, resumen] = await Promise.all([
    read(ARCHIVOS_LEGALES.convenio),
    read(ARCHIVOS_LEGALES.aviso),
    read(ARCHIVOS_LEGALES.resumen),
  ]);
  if (aviso.version !== resumen.version) {
    throw new Error("El aviso integral y el simplificado deben tener la misma versión.");
  }
  return [
    {
      tipo: convenio.tipo,
      version: convenio.version,
      contenido_md: convenio.contenido,
      resumen_md: null,
    },
    {
      tipo: aviso.tipo,
      version: aviso.version,
      contenido_md: aviso.contenido,
      resumen_md: resumen.contenido,
    },
  ];
}

const literal = (text: string | null) => {
  if (text === null) return "null";
  if (text.includes("$plantilla$")) throw new Error("El texto no puede contener $plantilla$.");
  return `$plantilla$${text}$plantilla$`;
};

export async function buildLegalSeed(): Promise<string> {
  const filas = (await readLegalTemplates()).map(
    (p) => `  ('${p.tipo}', '${p.version}', ${literal(p.contenido_md)}, ${literal(p.resumen_md)})`,
  );
  return [
    "-- GENERADO por packages/db/src/seed-legal.ts a partir de docs/legal. No editar a mano:",
    "-- cambia el archivo de docs/legal y ejecuta `pnpm db:seed:legal`.",
    "-- Idempotente: una plantilla ya cargada se actualiza con el texto del archivo.",
    "insert into cumplimiento.plantilla (tipo, version, contenido_md, resumen_md) values",
    `${filas.join(",\n")}`,
    "on conflict (tipo, version) do update",
    "set contenido_md = excluded.contenido_md, resumen_md = excluded.resumen_md;",
    "",
  ].join("\n");
}

if (import.meta.main) {
  const destino = path.join(root, "supabase/seeds/0002_plantillas_legales.sql");
  await writeFile(destino, await buildLegalSeed());
  console.log(`Escrito ${path.relative(root, destino)}`);
}
