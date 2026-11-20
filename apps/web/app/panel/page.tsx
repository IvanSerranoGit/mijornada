import { getPanelSemanal, listEmpresas, type SemanaTrabajador } from "@mijornada/api";
import { Chip, Tarjeta, cx } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "../../lib/supabase/server.ts";
import { Invitar } from "./Invitar.tsx";
import { AccionesKiosco } from "./AccionesKiosco.tsx";

export const metadata: Metadata = { title: "Panel · Mi Jornada" };
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

const horas = (minutos: number) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
};

function hora(instante: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instante));
}

function FilaSemana({
  semana,
  hoy,
  zona,
}: {
  semana: SemanaTrabajador;
  hoy: string;
  zona: string;
}) {
  const extra = semana.resumen.minutosExtraDobles + semana.resumen.minutosExtraTriples;
  const sinFoto = semana.dias.reduce((total, dia) => total + dia.fotosNoDisponibles, 0);
  return (
    <li className="flex flex-col gap-(--espacio-sm) py-(--espacio-md)">
      <div className="flex flex-wrap items-center justify-between gap-(--espacio-sm)">
        <div>
          <p className="font-medium">{semana.trabajador.nombre}</p>
          <p className="text-pequeno text-text-secondary">
            {semana.ultimaMarca
              ? `${TIPOS[semana.ultimaMarca.tipo] ?? semana.ultimaMarca.tipo} a las ${hora(semana.ultimaMarca.hora, zona)}`
              : "Sin marcas hoy"}
            {semana.ultimaMarca?.origen === "sincronizacion_tardia"
              ? " · llegó tarde por falta de red"
              : ""}
          </p>
        </div>
        <Chip tono={semana.estado.tono}>{semana.estado.etiqueta}</Chip>
      </div>

      <div className="flex items-end gap-(--espacio-xs)">
        {semana.dias.map((dia, index) => (
          <div key={dia.fecha} className="flex flex-1 flex-col items-center gap-(--espacio-2xs)">
            <Link
              href={`/panel/dia?trabajador=${semana.trabajador.id}&fecha=${dia.fecha}`}
              aria-label={`Ver el día ${dia.fecha} de ${semana.trabajador.nombre}`}
              title={
                dia.estado === "incompleto"
                  ? "Falta una marca"
                  : dia.fotosNoDisponibles > 0
                    ? "Foto no disponible"
                    : undefined
              }
              className={cx(
                "block w-full rounded-(--radio-sm) py-(--espacio-2xs) text-center text-nota",
                dia.fecha === hoy && "ring-1 ring-border-brand",
                dia.estado === "incompleto"
                  ? "bg-status-warning-soft text-status-warning-text"
                  : dia.minutosTrabajados > 0
                    ? "bg-bg-brand-soft text-text-brand"
                    : "bg-bg-subtle text-text-secondary",
              )}
            >
              {dia.estado === "incompleto" && dia.minutosTrabajados === 0
                ? "…"
                : dia.minutosTrabajados > 0
                  ? (dia.minutosTrabajados / 60).toFixed(1)
                  : "–"}
            </Link>
            <span className="text-nota text-text-secondary">{DIAS_CORTOS[index]}</span>
          </div>
        ))}
      </div>
      {sinFoto > 0 ? (
        <p className="text-pequeno text-status-warning-text">
          Foto no disponible en {sinFoto} {sinFoto === 1 ? "marca" : "marcas"} de esta semana.
        </p>
      ) : null}

      <p className="text-pequeno text-text-secondary">
        {horas(semana.resumen.minutosOrdinarios)} ordinarias
        {extra > 0 ? ` · ${horas(extra)} extra` : ""}
        {semana.resumen.minutosExtraTriples > 0
          ? ` (${horas(semana.resumen.minutosExtraTriples)} triples)`
          : ""}
      </p>
      <Invitar trabajadorId={semana.trabajador.id} />
    </li>
  );
}

export default async function PanelPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol === "empleado") redirect("/app");

  const [empresas, panel] = await Promise.all([listEmpresas(ctx), getPanelSemanal(ctx)]);
  const empresa = empresas.find((e) => e.id === ctx.sesion.tenantId);
  if (empresa && !empresa.onboarding_completado_en) redirect("/onboarding");

  const marcaronHoy = panel.trabajadores.filter((t) => t.ultimaMarca !== null).length;
  const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${panel.hoy}T00:00:00Z`),
  );

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <p className="text-etiqueta font-medium text-text-secondary uppercase">{fecha}</p>
        <h1 className="font-titulo text-titulo-1 font-bold">
          {empresa?.razon_social ?? "Tu negocio"}
        </h1>
        <p className="text-text-secondary">
          {marcaronHoy} de {panel.trabajadores.length}{" "}
          {panel.trabajadores.length === 1 ? "persona ha" : "personas han"} marcado hoy.
        </p>
      </section>

      {panel.centros.map((centro) => {
        const delCentro = panel.trabajadores.filter((t) => t.trabajador.centro_id === centro.id);
        return (
          <Tarjeta key={centro.id}>
            <h2 className="font-titulo text-titulo-3 font-bold">{centro.nombre}</h2>
            <p className="text-pequeno text-text-secondary">Semana en curso · horas por día</p>
            {centro.kioscoSinCamara ? (
              <p
                role="status"
                className="my-(--espacio-sm) rounded-(--radio-md) bg-status-warning-soft p-(--espacio-sm) text-pequeno text-status-warning-text"
              >
                El kiosco de este centro no tiene cámara o no dio permiso para usarla: las marcas se
                registran sin foto.
              </p>
            ) : null}
            {centro.metodo_marcaje !== "telefono" ? <AccionesKiosco centroId={centro.id} /> : null}
            {delCentro.length === 0 ? (
              <p className="py-(--espacio-md) text-text-secondary">
                Este centro aún no tiene personas.
              </p>
            ) : (
              <ul className="divide-y divide-border-default">
                {delCentro.map((semana) => (
                  <FilaSemana
                    key={semana.trabajador.id}
                    semana={semana}
                    hoy={panel.hoy}
                    zona={centro.zona_horaria}
                  />
                ))}
              </ul>
            )}
          </Tarjeta>
        );
      })}
    </>
  );
}
