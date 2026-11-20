import { getPanelSemanal, listCentros, listConsentimientos } from "@mijornada/api";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "../../lib/supabase/server.ts";
import { Marcador } from "./Marcador.tsx";

export const metadata: Metadata = { title: "Mi Jornada" };
export const dynamic = "force-dynamic";

// PWA del trabajador: una sola pantalla para registrar entrada y salida.
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ despues?: string }>;
}) {
  const ctx = await getCtx();
  if (ctx === null) redirect("/app/entrar");
  if (ctx.sesion.rol !== "empleado" || ctx.sesion.trabajadorId === null) redirect("/panel");

  const [panel, centros, consentimientos] = await Promise.all([
    getPanelSemanal(ctx),
    listCentros(ctx),
    listConsentimientos(ctx),
  ]);
  // Con documentos sin aceptar se piden primero; "ahora no" deja marcar igual: registrar
  // la jornada es obligación del patrón y no depende de la aceptación.
  const pendientes = consentimientos.some(
    (c) => c.trabajador_id === ctx.sesion.trabajadorId && !c.aceptado,
  );
  if (pendientes && (await searchParams).despues !== "1") redirect("/app/documentos");
  const semana = panel.trabajadores.find((t) => t.trabajador.id === ctx.sesion.trabajadorId);
  const centro = centros.find((c) => c.id === semana?.trabajador.centro_id);
  if (!semana) redirect("/app/entrar");

  return (
    <Marcador
      trabajadorId={semana.trabajador.id}
      nombre={semana.trabajador.nombre.split(" ")[0] ?? semana.trabajador.nombre}
      zona={centro?.zona_horaria ?? panel.zonaHoraria}
      fotoRequerida={centro?.foto_en_telefono ?? false}
      documentosPendientes={pendientes}
      hoy={panel.hoy}
      ultimaMarca={semana.ultimaMarca}
      dias={semana.dias}
      estado={semana.estado}
      minutosSemana={
        semana.resumen.minutosOrdinarios +
        semana.resumen.minutosExtraDobles +
        semana.resumen.minutosExtraTriples
      }
    />
  );
}
