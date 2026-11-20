import { getVerificacionPublica, TITULO_REPORTE, type TipoReporte } from "@mijornada/api";
import { Chip, Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fechaCorta, fechaHora } from "../../../lib/formato.ts";
import { createSupabasePublic } from "../../../lib/supabase/admin.ts";

export const metadata: Metadata = {
  title: "Verificación de reporte · Mi Jornada",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const ZONA = "America/Mexico_City";

// Verificación pública de un reporte (QR y URL de su carátula). Recalcula las cadenas al
// abrirse y dice si los registros siguen íntegros. No muestra datos personales.
export default async function VerificarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  const v = await getVerificacionPublica(createSupabasePublic(), token);
  if (v === null) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <Logo tamano={32} />
      <section className="flex flex-col gap-(--espacio-sm)">
        <p className="text-etiqueta font-medium text-text-secondary uppercase">
          Verificación de integridad
        </p>
        <h1 className="font-titulo text-titulo-1 font-bold">
          {v.integra ? "Los registros están íntegros" : "Los registros fueron alterados"}
        </h1>
        <div>
          <Chip tono={v.integra ? "bien" : "critico"}>{v.integra ? "Íntegro" : "No íntegro"}</Chip>
        </div>
        <p className="text-text-secondary">
          {v.integra
            ? "Se recalcularon ahora las huellas encadenadas de los registros de este reporte y todas coinciden: ningún registro se ha modificado ni eliminado."
            : "Al recalcular las huellas encadenadas de los registros de este reporte, al menos una cadena ya no coincide."}
        </p>
      </section>

      <Tarjeta>
        <dl className="grid gap-(--espacio-md) text-pequeno sm:grid-cols-2">
          <div>
            <dt className="text-text-secondary">Reporte</dt>
            <dd className="font-medium">{TITULO_REPORTE[v.tipo as TipoReporte]}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Periodo</dt>
            <dd className="font-medium">
              {fechaCorta(v.desde)} al {fechaCorta(v.hasta)}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Generado</dt>
            <dd className="font-medium">{fechaHora(v.generado_en, ZONA)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Registros verificados</dt>
            <dd className="font-medium">
              {v.eventos} en {v.cadenas} {v.cadenas === 1 ? "cadena" : "cadenas"} (al generarse:{" "}
              {v.eventos_al_generar})
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Días sellados del periodo</dt>
            <dd className="font-medium">
              {v.dias_sellados}
              {v.ultimo_sello ? ` · último sello: ${fechaHora(v.ultimo_sello, ZONA)}` : ""}
            </dd>
          </div>
        </dl>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-(--espacio-xs)">
        <h2 className="font-titulo text-titulo-3 font-bold">Huellas del reporte</h2>
        <p className="text-pequeno text-text-secondary">
          Deben coincidir con las de la carátula del PDF. La primera es el SHA-256 del archivo de
          eventos (CSV) que lo acompaña.
        </p>
        <p className="font-mono text-nota break-all">CSV de eventos: {v.hash_contenido}</p>
        <p className="font-mono text-nota break-all">Hash raíz del periodo: {v.hash_raiz}</p>
      </Tarjeta>

      <p className="text-nota text-text-secondary">
        Esta página no muestra datos personales. El detalle del registro lo entrega el patrón a la
        autoridad laboral.
      </p>
    </main>
  );
}
