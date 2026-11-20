import {
  ApiError,
  openReporteInspector,
  origenDe,
  TITULO_REPORTE,
  type TipoReporte,
} from "@mijornada/api";
import { Chip, Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { fechaCorta, fechaHora } from "../../lib/formato.ts";
import { getCtx } from "../../lib/supabase/server.ts";

export const metadata: Metadata = {
  title: "Reporte de jornada · Mi Jornada",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/** Extremos de un daterange de Postgres: "[2026-11-01,2026-12-01)" → primer y último día. */
function periodo(rango: unknown): [string, string] {
  const [desde = "", hasta = ""] = String(rango)
    .replace(/[[\]()]/g, "")
    .split(",");
  const ultimo = new Date(`${hasta}T00:00:00Z`);
  ultimo.setUTCDate(ultimo.getUTCDate() - 1);
  return [desde, ultimo.toISOString().slice(0, 10)];
}

function Vencido() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-(--espacio-lg) p-(--espacio-lg)">
      <Logo tamano={32} />
      <h1 className="font-titulo text-titulo-2 font-bold">Este acceso ya no está disponible</h1>
      <p className="text-text-secondary">
        El enlace venció (dura 72 horas) o fue revocado. Solicite uno nuevo al patrón.
      </p>
    </main>
  );
}

// Página del inspector: el único reporte de su acceso, su verificación y sus archivos.
// Abrirla, verificar y descargar quedan registrados con hora e IP.
export default async function InspectorPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.sesion.rol !== "inspector") return <Vencido />;

  let datos: Awaited<ReturnType<typeof openReporteInspector>>;
  try {
    datos = await openReporteInspector(ctx, origenDe(await headers()).ip);
  } catch (error) {
    if (error instanceof ApiError) return <Vencido />;
    throw error;
  }
  const { reporte, verificacion } = datos;
  const [desde, hasta] = periodo(reporte.rango);
  const zona = "America/Mexico_City";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <Logo tamano={32} />
      <section className="flex flex-col gap-(--espacio-2xs)">
        <p className="text-etiqueta font-medium text-text-secondary uppercase">
          Acceso de inspección
        </p>
        <h1 className="font-titulo text-titulo-1 font-bold">
          {TITULO_REPORTE[reporte.tipo as TipoReporte]}
        </h1>
        <p className="text-text-secondary">
          Periodo del {fechaCorta(desde)} al {fechaCorta(hasta)} · generado el{" "}
          {fechaHora(reporte.generado_en, zona)}
        </p>
      </section>

      <Tarjeta className="flex flex-col gap-(--espacio-sm)">
        <div className="flex flex-wrap items-center justify-between gap-(--espacio-xs)">
          <h2 className="font-titulo text-titulo-3 font-bold">Verificación de integridad</h2>
          <Chip tono={verificacion.integra ? "bien" : "critico"}>
            {verificacion.integra ? "Registros íntegros" : "Registros alterados"}
          </Chip>
        </div>
        <p className="text-pequeno">
          Se recalculó ahora la cadena de huellas de {verificacion.cadenas}{" "}
          {verificacion.cadenas === 1 ? "persona" : "personas"}: {verificacion.eventos} registros
          {verificacion.integra
            ? " sin alteraciones."
            : `; ${String(verificacion.rotas)} con la cadena rota.`}
        </p>
        <p className="font-mono text-nota break-all text-text-secondary">
          Huella del CSV de eventos (SHA-256): {reporte.hash_contenido}
        </p>
        <p className="font-mono text-nota break-all text-text-secondary">
          Hash raíz del periodo: {reporte.hash_raiz}
        </p>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-(--espacio-sm)">
        <h2 className="font-titulo text-titulo-3 font-bold">Archivos</h2>
        <ul className="flex flex-col gap-(--espacio-xs) text-pequeno">
          <li>
            <a
              href={`/reportes/${reporte.id}/pdf`}
              className="font-medium text-text-brand underline"
            >
              Reporte en PDF
            </a>
          </li>
          <li>
            <a
              href={`/reportes/${reporte.id}/eventos`}
              className="font-medium text-text-brand underline"
            >
              Eventos del periodo (CSV)
            </a>
          </li>
          <li>
            <a
              href={`/reportes/${reporte.id}/dias`}
              className="font-medium text-text-brand underline"
            >
              Días laborales (CSV)
            </a>
          </li>
        </ul>
      </Tarjeta>

      <p className="text-nota text-text-secondary">
        Este acceso vence el {fechaHora(datos.expira_en, zona)}. Cada consulta y cada descarga
        quedan registradas con fecha, hora y dirección IP.
      </p>
    </main>
  );
}
