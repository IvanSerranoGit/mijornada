import { getMisDocumentos } from "@mijornada/api";
import { Chip, Logo } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SITE_URL } from "../../../lib/supabase/env.ts";
import { getCtx } from "../../../lib/supabase/server.ts";
import { Consentimiento } from "./Consentimiento.tsx";

export const metadata: Metadata = { title: "Mis documentos · Mi Jornada" };
export const dynamic = "force-dynamic";

const METODOS: Record<string, string> = {
  firma_simple: "con tu nombre en la app",
  clic: "en el kiosco",
  firma_autografa: "con firma autógrafa",
};

// Documentos del trabajador: pide aceptar lo pendiente y deja consultar lo ya aceptado.
export default async function MisDocumentosPage() {
  const ctx = await getCtx();
  if (ctx === null) redirect("/app/entrar");
  if (ctx.sesion.rol !== "empleado") redirect("/panel");

  const { nombre, documentos } = await getMisDocumentos(ctx, SITE_URL);
  const pendientes = documentos.filter((d) => !d.aceptado);
  const aceptados = documentos.filter((d) => d.aceptado);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex items-center justify-between">
        <Logo tamano={28} />
        <Link href="/app?despues=1" className="text-pequeno font-medium text-text-brand">
          Volver a marcar
        </Link>
      </header>

      {pendientes.length > 0 ? (
        <>
          <section className="flex flex-col gap-(--espacio-2xs)">
            <h1 className="font-titulo text-titulo-2 font-bold">Antes de empezar</h1>
            <p className="text-text-secondary">
              Tu jornada se registra con esta app. Lee cómo se usan tus datos y el acuerdo de
              registro, y acéptalos con tu nombre.
            </p>
          </section>
          <Consentimiento nombre={nombre} pendientes={pendientes} />
        </>
      ) : (
        <section className="flex flex-col gap-(--espacio-2xs)">
          <h1 className="font-titulo text-titulo-2 font-bold">Mis documentos</h1>
          <p className="text-text-secondary">
            {documentos.length === 0
              ? "Tu empresa todavía no ha publicado sus documentos."
              : "Ya aceptaste todo. Aquí puedes volver a leerlos cuando quieras."}
          </p>
        </section>
      )}

      {aceptados.map((documento) => (
        <details
          key={documento.id}
          className="rounded-(--radio-md) border border-border-default p-(--espacio-md)"
        >
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-(--espacio-xs)">
            <span className="font-medium">{documento.titulo}</span>
            <Chip tono="bien">
              Aceptado {documento.metodos.map((m) => METODOS[m] ?? m).join(" y ")}
            </Chip>
          </summary>
          <div
            className="documento mt-(--espacio-md)"
            dangerouslySetInnerHTML={{ __html: documento.contenido_html }}
          />
        </details>
      ))}
    </main>
  );
}
