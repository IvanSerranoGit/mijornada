import {
  datosLegalesFaltantes,
  ensureDocumentos,
  getEmpresa,
  listConsentimientos,
  listTrabajadores,
  TIPOS_DOCUMENTO,
  TITULO_DOCUMENTO,
} from "@mijornada/api";
import { Chip, Tarjeta } from "@mijornada/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "../../../lib/supabase/server.ts";
import { DatosLegalesForm, LogoForm, PublicarVersion, SubirFirma } from "./Formularios.tsx";

export const metadata: Metadata = { title: "Documentos · Mi Jornada" };
export const dynamic = "force-dynamic";

const METODOS: Record<string, string> = {
  firma_simple: "firma en la app",
  clic: "aceptó en el kiosco",
  firma_autografa: "firma autógrafa",
};

const fecha = (dia: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${dia.slice(0, 10)}T00:00:00Z`),
  );

// Documentos del patrón: datos que llevan, versiones, PDF para firma y consentimientos.
export default async function DocumentosPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/panel/documentos");
  if (ctx.sesion.tenantId === null) redirect("/onboarding");
  if (ctx.sesion.rol !== "dueno" && ctx.sesion.rol !== "administrador") redirect("/panel");

  const [empresa, documentos, trabajadores] = await Promise.all([
    getEmpresa(ctx, ctx.sesion.tenantId),
    ensureDocumentos(ctx),
    listTrabajadores(ctx, { limite: 200 }),
  ]);
  const estados = await listConsentimientos(ctx);
  const faltantes = datosLegalesFaltantes(empresa);
  const activos = trabajadores.datos.filter((t) => t.fecha_baja === null);

  return (
    <>
      <section className="flex flex-col gap-(--espacio-2xs)">
        <h1 className="font-titulo text-titulo-1 font-bold">Documentos</h1>
        <p className="text-text-secondary">
          El convenio de registro y el aviso de privacidad que acepta tu equipo. La ley da valor de
          prueba plena al registro cuando fue acordado con cada persona.
        </p>
      </section>

      <p
        role="note"
        className="rounded-(--radio-md) bg-status-warning-soft p-(--espacio-md) text-pequeno text-status-warning-text"
      >
        Versión preliminar: estos textos todavía no los ha revisado un abogado. Puedes usarlos
        durante el piloto y reemplazarlos aquí mismo cuando tengas la versión revisada.
      </p>

      <Tarjeta className="flex flex-col gap-(--espacio-md)">
        <div>
          <h2 className="font-titulo text-titulo-3 font-bold">Datos de tu negocio</h2>
          <p className="text-pequeno text-text-secondary">
            {faltantes.length > 0
              ? `Faltan: ${faltantes.join(", ")}. Mientras tanto, en los documentos queda una línea para llenarlos a mano.`
              : "Estos datos aparecen en el convenio y en el aviso de privacidad."}
          </p>
        </div>
        <DatosLegalesForm datos={empresa} />
        <LogoForm cargado={empresa.logo_url !== null} />
      </Tarjeta>

      {TIPOS_DOCUMENTO.map((tipo) => {
        const versiones = documentos.filter((d) => d.tipo === tipo);
        const vigente = versiones[0];
        if (vigente === undefined) return null;
        const aceptaron = estados.filter((e) => e.documento_id === vigente.id && e.aceptado).length;
        return (
          <Tarjeta key={tipo} className="flex flex-col gap-(--espacio-md)">
            <div className="flex flex-wrap items-start justify-between gap-(--espacio-sm)">
              <div>
                <h2 className="font-titulo text-titulo-3 font-bold">{TITULO_DOCUMENTO[tipo]}</h2>
                <p className="text-pequeno text-text-secondary">
                  Versión {vigente.version} · vigente desde el {fecha(vigente.vigente_desde)} ·{" "}
                  {vigente.plantilla_version === null
                    ? "texto propio"
                    : `plantilla de Mi Jornada ${vigente.plantilla_version}`}
                </p>
              </div>
              <Chip tono={aceptaron === activos.length && activos.length > 0 ? "bien" : "alerta"}>
                {aceptaron} de {activos.length} lo aceptaron
              </Chip>
            </div>
            <p className="font-mono text-nota break-all text-text-secondary">
              Huella (SHA-256): {vigente.contenido_hash}
            </p>
            <a
              href={`/panel/documentos/${vigente.id}/pdf`}
              className="text-pequeno font-medium text-text-brand underline"
            >
              Descargar PDF en blanco para imprimir
            </a>

            <ul className="divide-y divide-border-default">
              {activos.map((trabajador) => {
                const estado = estados.find(
                  (e) => e.trabajador_id === trabajador.id && e.documento_id === vigente.id,
                );
                const metodos = estado?.metodos ?? [];
                return (
                  <li
                    key={trabajador.id}
                    className="flex flex-col gap-(--espacio-xs) py-(--espacio-sm)"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-(--espacio-xs)">
                      <p className="font-medium">{trabajador.nombre}</p>
                      {estado?.aceptado ? (
                        <Chip tono="bien">
                          {metodos.map((m) => METODOS[m] ?? m).join(" y ")}
                          {estado.aceptado_en ? ` · ${fecha(estado.aceptado_en)}` : ""}
                        </Chip>
                      ) : (
                        <Chip tono="alerta">Consentimiento pendiente</Chip>
                      )}
                    </div>
                    {metodos.includes("firma_autografa") ? null : (
                      <div className="flex flex-wrap items-center gap-(--espacio-sm)">
                        <a
                          href={`/panel/documentos/${vigente.id}/pdf?trabajador=${trabajador.id}`}
                          className="text-pequeno text-text-brand underline"
                        >
                          PDF con su nombre
                        </a>
                        <SubirFirma trabajadorId={trabajador.id} documentoId={vigente.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <PublicarVersion tipo={tipo} conResumen={tipo === "aviso_privacidad"} />
            {versiones.length > 1 ? (
              <details className="text-pequeno text-text-secondary">
                <summary className="cursor-pointer">Versiones anteriores</summary>
                <ul className="mt-(--espacio-xs) flex flex-col gap-(--espacio-2xs)">
                  {versiones.slice(1).map((v) => (
                    <li key={v.id}>
                      Versión {v.version} · {fecha(v.vigente_desde)} ·{" "}
                      <a href={`/panel/documentos/${v.id}/pdf`} className="underline">
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Tarjeta>
        );
      })}
    </>
  );
}
