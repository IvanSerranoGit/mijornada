// Aplica en orden los seeds versionados de `supabase/seeds/*.sql`.
// Los seeds deben ser idempotentes: este script puede ejecutarse varias veces.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { resolveDatabaseUrl } from "./index.ts";

const seedsDir = path.resolve(import.meta.dirname, "../../../supabase/seeds");

async function main(): Promise<void> {
  const files = (await readdir(seedsDir)).filter((file) => file.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("No hay seeds que aplicar.");
    return;
  }

  const sql = postgres(resolveDatabaseUrl(), { max: 1, onnotice: () => undefined });
  try {
    for (const file of files) {
      const content = await readFile(path.join(seedsDir, file), "utf8");
      await sql.unsafe(content);
      console.log(`Seed aplicado: ${file}`);
    }
  } finally {
    await sql.end();
  }
}

await main();
