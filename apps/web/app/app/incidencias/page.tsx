import {
  getPanelSemanal,
  listCentros,
  listIncidencias,
  TITULO_INCIDENCIA,
  type TipoIncidencia,
} from "@mijornada/api";
import { Chip, Logo, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioIncidencia } from "../../../components/FormularioIncidencia.tsx";
import { fechaCorta, hora, TIPOS_MARCAJE } from "../../../lib/formato.ts";
import { marcasElegibles } from "../../../lib/marcas.ts";
import { getCtx } from "../../../lib/supabase/server.ts";
import { abrir } from "./actions.ts";
import { Responder } from "./Responder.tsx";

export const metadata: Metadata = { title: "Incidencias · Mi Jornada" };
export const dynamic = "force-dynamic";

const ESTADOS: Record<string, { texto: string; tono: "bien" | "alerta" | "critico" | "neutro" }> = {
  pendiente: { texto: "En revisión", tono: "alerta" },
  aprobada: { texto: "Aprobada", tono: "bien" },
  rechazada: { texto: "Rechazada", tono: "critico" },
};

// Incidencias del trabajador: reporta un olvido o un error, ve el estado y responde a
// las correcciones que inició su empresa.
export default async function MisIncidenciasPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/app/entrar");
  if (ctx.sesion.rol !== "empleado" || ctx.sesion.trabajadorId === null)
    redirect("/panel/incidencias");
  const trabajadorId = ctx.sesion.trabajadorId;

  const [panel, centros, incidencias] = await Promise.all([
    getPanelSemanal(ctx),
    listCentros(ctx),
    listIncidencias(ctx, { trabajador_id: trabajadorId }),
  ]);
  const yo = panel.trabajadores.find((t) => t.trabajador.id === trabajadorId);
  const zona =
    centros.find((c) => c.id === yo?.trabajador.centro_id)?.zona_horaria ?? panel.zonaHoraria;
  const marcas = await marcasElegibles(ctx, trabajadorId, panel.hoy, zona);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex items-center justify-between">
        <Logo tamano={28} />
        <Link href="/app?despues=1" className="text-pequeno font-medium text-text-brand">
          Volver a marcar
        </Link>
      </header>

      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-2 font-bold">Incidencias</h1>
        <p className="text-text-secondary">
          Si olvidaste marcar o una marca quedó mal, repórtalo aquí. Tu marca original nunca se
          borra.
        </p>
      </section>

      {incidencias.map((incidencia) => {
        const estado = ESTADOS[incidencia.estado] ?? { texto: incidencia.estado, tono: "neutro" };
        const porResponder =
          !incidencia.abierta_por_trabajador && incidencia.conformidad === "sin_respuesta";
        return (
          <Tarjeta key={incidencia.id} className="flex flex-col gap-(--espacio-sm)">
            <div className="flex flex-wrap items-start justify-between gap-(--espacio-xs)">
              <div>
                <p className="font-medium">
                  {TITULO_INCIDENCIA[incidencia.tipo as TipoIncidencia]}
                </p>
                <p className="text-pequeno text-text-secondary">{fechaCorta(incidencia.fecha)}</p>
              </div>
              <Chip tono={estado.tono}>{estado.texto}</Chip>
            </div>
            {incidencia.ts_declarado ? (
              <p className="tabular-nums">
                {incidencia.hora_original ? (
                  <>
                    <span className="text-text-secondary line-through">
                      {hora(incidencia.hora_original, zona)}
                    </span>
                    {" → "}
                  </>
                ) : (
                  `${TIPOS_MARCAJE[incidencia.tipo_marcaje ?? ""] ?? "Marca"} a las `
                )}
                <strong>{hora(incidencia.ts_declarado, zona)}</strong>
              </p>
            ) : null}
            <p className="text-pequeno">“{incidencia.motivo}”</p>
            {incidencia.abierta_por_trabajador ? null : (
              <p className="text-pequeno text-text-secondary">
                La abrió tu empresa.{" "}
                {incidencia.conformidad === "conforme"
                  ? "Estuviste de acuerdo."
                  : incidencia.conformidad === "inconforme"
                    ? `No estuviste de acuerdo: “${incidencia.comentario_trabajador ?? ""}”`
                    : "Dinos si estás de acuerdo."}
              </p>
            )}
            {porResponder ? <Responder id={incidencia.id} /> : null}
          </Tarjeta>
        );
      })}

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <h2 className="font-titulo text-titulo-3 font-bold">Reportar una incidencia</h2>
        <FormularioIncidencia accion={abrir} hoy={panel.hoy} marcas={marcas} />
      </Tarjeta>
    </main>
  );
}
