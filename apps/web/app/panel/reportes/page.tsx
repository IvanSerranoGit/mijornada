import {
  getEmpresa,
  listAccesosInspector,
  listCentros,
  listConsultasInspector,
  listReportes,
  listTrabajadores,
  TITULO_REPORTE,
  type TipoReporte,
} from "@mijornada/api";
import { dateInZone } from "@mijornada/dominio";
import { Chip, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fechaCorta, fechaHora } from "../../../lib/formato.ts";
import { getCtx } from "../../../lib/supabase/server.ts";
import { CompartirConInspector, GenerarReporte, RevocarAcceso } from "./Formularios.tsx";

export const metadata: Metadata = { title: "Reportes · Mi Jornada" };
export const dynamic = "force-dynamic";

const CONSULTAS: Record<string, string> = {
  acceso_inspector: "Verificó la integridad",
  inspector_abre_reporte: "Abrió el reporte",
  inspector_descarga_pdf: "Descargó el PDF",
  inspector_descarga_csv_eventos: "Descargó el CSV de eventos",
  inspector_descarga_csv_dias: "Descargó el CSV de días",
};

/** Extremos de un daterange de Postgres: "[2026-11-01,2026-12-01)" → primer y último día. */
function periodo(rango: unknown): [string, string] {
  const [desde = "", hasta = ""] = String(rango)
    .replace(/[[\]()]/g, "")
    .split(",");
  const ultimo = new Date(`${hasta}T00:00:00Z`);
  ultimo.setUTCDate(ultimo.getUTCDate() - 1);
  return [desde, ultimo.toISOString().slice(0, 10)];
}

// Reportes: generar el de inspección, descargarlo y compartirlo con un inspector.
export default async function ReportesPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel/reportes");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") redirect("/panel");

  const [empresa, centros, trabajadores, reportes, accesos] = await Promise.all([
    getEmpresa(ctx, ctx.sesion.tenantId),
    listCentros(ctx),
    listTrabajadores(ctx, { limite: 200 }),
    listReportes(ctx),
    listAccesosInspector(ctx),
  ]);
  const zona = empresa.zona_horaria;
  const hoy = dateInZone(new Date(), zona);
  const compartidos = [...new Set(accesos.map((a) => a.reporte_id))];
  const consultas = new Map(
    await Promise.all(
      compartidos.map(async (id) => [id, await listConsultasInspector(ctx, id)] as const),
    ),
  );
  const ahora = Date.now();

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-1 font-bold">Reportes</h1>
        <p className="text-text-secondary">
          El reporte para inspección reúne el registro diario, las correcciones, las horas extra
          contra los topes y un acta de integridad que cualquiera puede verificar.
        </p>
      </section>

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <h2 className="font-titulo text-titulo-3 font-bold">Generar un reporte</h2>
        <GenerarReporte
          hoy={hoy}
          inicioDeMes={`${hoy.slice(0, 8)}01`}
          centros={centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
          personas={trabajadores.datos.map((t) => ({ id: t.id, nombre: t.nombre }))}
        />
      </Tarjeta>

      {reportes.length === 0 ? (
        <p className="text-text-secondary">Todavía no has generado reportes.</p>
      ) : (
        <ul className="flex flex-col gap-(--espacio-md)">
          {reportes.map((reporte) => {
            const [desde, hasta] = periodo(reporte.rango);
            const suyos = accesos.filter((a) => a.reporte_id === reporte.id);
            const rastro = consultas.get(reporte.id) ?? [];
            return (
              <li key={reporte.id}>
                <Tarjeta className="flex flex-col gap-(--espacio-sm)">
                  <div>
                    <p className="font-medium">{TITULO_REPORTE[reporte.tipo as TipoReporte]}</p>
                    <p className="text-pequeno text-text-secondary">
                      {fechaCorta(desde)} al {fechaCorta(hasta)} · {reporte.n_eventos ?? 0}{" "}
                      registros · generado el {fechaHora(reporte.generado_en, zona)}
                    </p>
                  </div>
                  <p className="font-mono text-nota break-all text-text-secondary">
                    Huella del CSV de eventos: {reporte.hash_contenido}
                  </p>
                  <div className="flex flex-wrap gap-(--espacio-md) text-pequeno">
                    <a
                      href={`/reportes/${reporte.id}/pdf`}
                      className="font-medium text-text-brand underline"
                    >
                      PDF
                    </a>
                    <a
                      href={`/reportes/${reporte.id}/eventos`}
                      className="font-medium text-text-brand underline"
                    >
                      CSV de eventos
                    </a>
                    <a
                      href={`/reportes/${reporte.id}/dias`}
                      className="font-medium text-text-brand underline"
                    >
                      CSV de días
                    </a>
                  </div>

                  <CompartirConInspector reporteId={reporte.id} />
                  {suyos.length > 0 ? (
                    <ul className="flex flex-col gap-(--espacio-2xs) text-pequeno">
                      {suyos.map((acceso) => {
                        const vigente =
                          acceso.revocado_en === null &&
                          new Date(acceso.expira_en).getTime() > ahora;
                        return (
                          <li
                            key={acceso.id}
                            className="flex flex-wrap items-center gap-(--espacio-xs)"
                          >
                            <Chip tono={vigente ? "bien" : "neutro"}>
                              {acceso.revocado_en !== null
                                ? "Revocado"
                                : vigente
                                  ? "Vigente"
                                  : "Vencido"}
                            </Chip>
                            <span>
                              Acceso de inspector creado el {fechaHora(acceso.creado_en, zona)}
                              {vigente ? ` · vence el ${fechaHora(acceso.expira_en, zona)}` : ""}
                            </span>
                            {vigente ? <RevocarAcceso accesoId={acceso.id} /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {rastro.length > 0 ? (
                    <details className="text-pequeno">
                      <summary className="cursor-pointer text-text-secondary">
                        Actividad del inspector ({rastro.length})
                      </summary>
                      <ul className="mt-(--espacio-xs) flex flex-col gap-(--espacio-2xs)">
                        {rastro.map((consulta, index) => (
                          <li key={index}>
                            {fechaHora(consulta.ts, zona)} ·{" "}
                            {CONSULTAS[consulta.accion] ?? consulta.accion}
                            {consulta.ip ? ` · IP ${consulta.ip}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
