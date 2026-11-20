import {
  getEmpresa,
  listCentros,
  listIncidencias,
  listTrabajadores,
  TITULO_INCIDENCIA,
  type IncidenciaListada,
  type TipoIncidencia,
} from "@mijornada/api";
import { dateInZone } from "@mijornada/dominio";
import { Chip, Tarjeta, cx } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioIncidencia } from "../../../components/FormularioIncidencia.tsx";
import { fechaCorta, fechaHora, hora, TIPOS_MARCAJE } from "../../../lib/formato.ts";
import { marcasElegibles } from "../../../lib/marcas.ts";
import { getCtx } from "../../../lib/supabase/server.ts";
import { abrir } from "./actions.ts";
import { Resolver } from "./Resolver.tsx";

export const metadata: Metadata = { title: "Incidencias · Mi Jornada" };
export const dynamic = "force-dynamic";

const ESTADOS = [
  { valor: "pendiente", titulo: "Pendientes" },
  { valor: "aprobada", titulo: "Aprobadas" },
  { valor: "rechazada", titulo: "Rechazadas" },
] as const;

const CONFORMIDAD: Record<IncidenciaListada["conformidad"], string> = {
  conforme: "Con conformidad del trabajador",
  inconforme: "El trabajador no está de acuerdo",
  sin_respuesta: "Sin conformidad del trabajador",
};

/** Qué se pide, en una línea: "Salida: 21:00 → 18:00". */
function Cambio({ incidencia, zona }: { incidencia: IncidenciaListada; zona: string }) {
  if (incidencia.ts_declarado === null) return null;
  const declarada = hora(incidencia.ts_declarado, zona);
  if (incidencia.tipo === "correccion_hora" && incidencia.hora_original !== null) {
    return (
      <p className="tabular-nums">
        <span className="text-text-secondary line-through">
          {hora(incidencia.hora_original, zona)}
        </span>
        {" → "}
        <strong>{declarada}</strong>
      </p>
    );
  }
  return (
    <p className="tabular-nums">
      {TIPOS_MARCAJE[incidencia.tipo_marcaje ?? ""] ?? "Marca"} a las <strong>{declarada}</strong>
    </p>
  );
}

// Bandeja de incidencias: lo pendiente de resolver, con filtros por estado y por centro.
export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; centro?: string }>;
}) {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel/incidencias");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol === "empleado") redirect("/app/incidencias");

  const filtros = await searchParams;
  const estado = ESTADOS.find((e) => e.valor === filtros.estado)?.valor ?? "pendiente";
  const [empresa, centros, trabajadores] = await Promise.all([
    getEmpresa(ctx, ctx.sesion.tenantId),
    listCentros(ctx),
    listTrabajadores(ctx, { limite: 200 }),
  ]);
  const centro = centros.find((c) => c.id === filtros.centro);
  const incidencias = await listIncidencias(ctx, {
    estado,
    ...(centro ? { centro_id: centro.id } : {}),
  });
  const hoy = dateInZone(new Date(), empresa.zona_horaria);
  const activos = trabajadores.datos.filter((t) => t.fecha_baja === null);
  const zonaDe = (centroId: string) =>
    centros.find((c) => c.id === centroId)?.zona_horaria ?? empresa.zona_horaria;
  const marcas = (
    await Promise.all(activos.map((t) => marcasElegibles(ctx, t.id, hoy, zonaDe(t.centro_id))))
  ).flat();
  const enlace = (cambios: { estado?: string; centro?: string | null }) => {
    const params = new URLSearchParams();
    params.set("estado", cambios.estado ?? estado);
    const centroId = cambios.centro === undefined ? centro?.id : cambios.centro;
    if (centroId) params.set("centro", centroId);
    return `/panel/incidencias?${params.toString()}`;
  };

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-1 font-bold">Incidencias</h1>
        <p className="text-text-secondary">
          Nadie edita una marca: se corrige con una incidencia, que conserva la marca original, el
          motivo y quién la autorizó.
        </p>
      </section>

      <div className="flex flex-col gap-(--espacio-xs)">
        <nav aria-label="Estado" className="flex flex-wrap gap-(--espacio-2xs)">
          {ESTADOS.map((e) => (
            <Link
              key={e.valor}
              href={enlace({ estado: e.valor })}
              aria-current={e.valor === estado ? "true" : undefined}
              className={cx(
                "rounded-(--radio-md) px-(--espacio-sm) py-(--espacio-xs) text-pequeno font-medium",
                e.valor === estado ? "bg-bg-brand-soft text-text-brand" : "text-text-secondary",
              )}
            >
              {e.titulo}
            </Link>
          ))}
        </nav>
        {centros.length > 1 ? (
          <nav aria-label="Centro" className="flex flex-wrap gap-(--espacio-2xs)">
            {[{ id: null, nombre: "Todos los centros" }, ...centros].map((c) => (
              <Link
                key={c.id ?? "todos"}
                href={enlace({ centro: c.id })}
                aria-current={(c.id ?? undefined) === centro?.id ? "true" : undefined}
                className={cx(
                  "rounded-(--radio-md) px-(--espacio-sm) py-(--espacio-xs) text-pequeno",
                  (c.id ?? undefined) === centro?.id
                    ? "bg-bg-subtle font-medium"
                    : "text-text-secondary",
                )}
              >
                {c.nombre}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {incidencias.length === 0 ? (
        <p className="text-text-secondary">No hay incidencias {estado}s.</p>
      ) : (
        <ul className="flex flex-col gap-(--espacio-md)">
          {incidencias.map((incidencia) => {
            const zona = zonaDe(incidencia.centro_id);
            return (
              <li key={incidencia.id}>
                <Tarjeta className="flex flex-col gap-(--espacio-sm)">
                  <div className="flex flex-wrap items-start justify-between gap-(--espacio-xs)">
                    <div>
                      <p className="font-medium">{incidencia.trabajador}</p>
                      <p className="text-pequeno text-text-secondary">
                        {TITULO_INCIDENCIA[incidencia.tipo as TipoIncidencia]} ·{" "}
                        {fechaCorta(incidencia.fecha)}
                      </p>
                    </div>
                    <Link
                      href={`/panel/dia?trabajador=${incidencia.trabajador_id}&fecha=${incidencia.fecha}`}
                      className="text-pequeno text-text-brand underline"
                    >
                      Ver el día
                    </Link>
                  </div>
                  <Cambio incidencia={incidencia} zona={zona} />
                  <p className="text-pequeno">“{incidencia.motivo}”</p>
                  <div className="flex flex-wrap gap-(--espacio-2xs)">
                    <Chip tono={incidencia.conformidad === "conforme" ? "bien" : "alerta"}>
                      {incidencia.abierta_por_trabajador
                        ? "La pidió el trabajador"
                        : CONFORMIDAD[incidencia.conformidad]}
                    </Chip>
                    {incidencia.extemporanea ? <Chip tono="alerta">Fuera de plazo</Chip> : null}
                  </div>
                  {incidencia.comentario_trabajador ? (
                    <p className="text-pequeno text-text-secondary">
                      Comentario del trabajador: “{incidencia.comentario_trabajador}”
                    </p>
                  ) : null}
                  <p className="text-nota text-text-secondary">
                    Abierta el {fechaHora(incidencia.creado_en, zona)}
                    {incidencia.resuelto_en
                      ? ` · resuelta el ${fechaHora(incidencia.resuelto_en, zona)}`
                      : ""}
                  </p>
                  {incidencia.estado === "pendiente" ? <Resolver id={incidencia.id} /> : null}
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <div>
          <h2 className="font-titulo text-titulo-3 font-bold">Abrir una incidencia</h2>
          <p className="text-pequeno text-text-secondary">
            Cuando la corrección la inicias tú, la persona puede dar su conformidad o su
            inconformidad desde su celular, y ambas quedan en el registro.
          </p>
        </div>
        <FormularioIncidencia
          accion={abrir}
          hoy={hoy}
          marcas={marcas}
          personas={activos.map((t) => ({ id: t.id, nombre: t.nombre }))}
        />
      </Tarjeta>
    </>
  );
}
