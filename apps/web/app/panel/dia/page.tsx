import { getDetalleMarcajes, getEmpresa, listCentros, listTrabajadores } from "@mijornada/api";
import { Chip, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { fechaCorta, fechaHora, hora, MEDIOS, TIPOS_MARCAJE } from "../../../lib/formato.ts";
import { getCtx } from "../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "Día · Mi Jornada" };
export const dynamic = "force-dynamic";

const parametros = z.object({ trabajador: z.uuid(), fecha: z.iso.date() });

const CONFORMIDAD: Record<string, string> = {
  conforme: "Con conformidad del trabajador",
  inconforme: "El trabajador no está de acuerdo",
  sin_respuesta: "Sin conformidad del trabajador",
};

// Vista de un día de una persona: cada marca con su hora original y, si se corrigió,
// la hora declarada, el motivo, quién autorizó y la conformidad, lado a lado.
export default async function DiaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  const params = parametros.safeParse(await searchParams);
  if (!params.success) notFound();

  const [empresa, centros, trabajadores, marcas] = await Promise.all([
    getEmpresa(ctx, ctx.sesion.tenantId),
    listCentros(ctx),
    listTrabajadores(ctx, { limite: 200 }),
    getDetalleMarcajes(ctx, {
      trabajador_id: params.data.trabajador,
      desde: params.data.fecha,
      hasta: params.data.fecha,
    }),
  ]);
  const trabajador = trabajadores.datos.find((t) => t.id === params.data.trabajador);
  if (trabajador === undefined) notFound();
  const zona =
    centros.find((c) => c.id === trabajador.centro_id)?.zona_horaria ?? empresa.zona_horaria;

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <Link href="/panel" className="text-pequeno text-text-brand underline">
          Volver al panel
        </Link>
        <h1 className="font-titulo text-titulo-1 font-bold">{trabajador.nombre}</h1>
        <p className="text-text-secondary first-letter:uppercase">
          {fechaCorta(params.data.fecha)}
        </p>
      </section>

      {marcas.length === 0 ? (
        <p className="text-text-secondary">No hay marcas este día.</p>
      ) : (
        <ul className="flex flex-col gap-(--espacio-md)">
          {marcas.map((marca) => {
            const corregida = marca.correccion_evento_id !== null;
            return (
              <li key={marca.evento_id}>
                <Tarjeta className="flex flex-col gap-(--espacio-sm)">
                  <div className="flex flex-wrap items-center justify-between gap-(--espacio-xs)">
                    <p className="font-medium">{TIPOS_MARCAJE[marca.tipo] ?? marca.tipo}</p>
                    <div className="flex flex-wrap gap-(--espacio-2xs)">
                      {marca.anulado ? <Chip tono="neutro">Anulada</Chip> : null}
                      <Chip tono={corregida ? "alerta" : "bien"}>
                        {corregida ? "Corregida" : "Original"}
                      </Chip>
                    </div>
                  </div>

                  <dl className="grid gap-(--espacio-sm) sm:grid-cols-2">
                    <div className="rounded-(--radio-md) bg-bg-subtle p-(--espacio-sm)">
                      <dt className="text-nota text-text-secondary uppercase">Marca original</dt>
                      <dd className="font-titulo text-titulo-3 font-bold tabular-nums">
                        {marca.hora_original ? hora(marca.hora_original, zona) : "No se marcó"}
                      </dd>
                      <dd className="text-nota text-text-secondary">
                        {MEDIOS[marca.origen] ?? marca.origen} · registrada el{" "}
                        {fechaHora(marca.ts_servidor, zona)}
                      </dd>
                    </div>
                    {corregida ? (
                      <div className="rounded-(--radio-md) bg-status-warning-soft p-(--espacio-sm)">
                        <dt className="text-nota text-status-warning-text uppercase">
                          Hora declarada
                        </dt>
                        <dd className="font-titulo text-titulo-3 font-bold tabular-nums">
                          {hora(marca.hora_vigente, zona)}
                        </dd>
                        <dd className="text-nota">
                          Autorizó {marca.correccion_autorizo ?? "—"}
                          {marca.correccion_registrada_en
                            ? ` el ${fechaHora(marca.correccion_registrada_en, zona)}`
                            : ""}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {corregida ? (
                    <div className="flex flex-col gap-(--espacio-2xs) text-pequeno">
                      <p>Motivo: “{marca.correccion_motivo}”</p>
                      <p>
                        Solicitó: {marca.solicitada_por ?? "—"} ·{" "}
                        {CONFORMIDAD[marca.conformidad ?? "sin_respuesta"]}
                        {marca.conformidad_en ? ` (${fechaHora(marca.conformidad_en, zona)})` : ""}
                      </p>
                      {marca.comentario_trabajador ? (
                        <p>Comentario del trabajador: “{marca.comentario_trabajador}”</p>
                      ) : null}
                      {marca.extemporanea ? <p>La incidencia se abrió fuera de plazo.</p> : null}
                    </div>
                  ) : null}
                  {marca.foto_estado === "no_disponible" || marca.foto_estado === "sin_camara" ? (
                    <p className="text-nota text-text-secondary">
                      Foto no disponible
                      {marca.foto_estado === "sin_camara"
                        ? " (el dispositivo no tenía cámara)"
                        : ""}
                      .
                    </p>
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
