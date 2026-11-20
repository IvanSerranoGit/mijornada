import { getAvisoPublico } from "@mijornada/api";
import { Logo } from "@mijornada/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SITE_URL } from "../../../lib/supabase/env.ts";
import { createSupabasePublic } from "../../../lib/supabase/admin.ts";

export const metadata: Metadata = {
  title: "Aviso de privacidad · Mi Jornada",
  robots: { index: false },
};

// Aviso de privacidad integral vigente del patrón para las personas de un centro.
// Es público (lo enlaza el aviso simplificado) y no lleva datos de ninguna persona.
export default async function AvisoPage({ params }: { params: Promise<{ centro: string }> }) {
  const centro = z.uuid().safeParse((await params).centro);
  if (!centro.success) notFound();
  const aviso = await getAvisoPublico(createSupabasePublic(), centro.data, SITE_URL).catch(
    () => null,
  );
  if (aviso === null) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <Logo tamano={28} />
      <article className="documento" dangerouslySetInnerHTML={{ __html: aviso.contenido_html }} />
      <p className="text-nota text-text-secondary">
        {aviso.razon_social} · versión {aviso.version}
      </p>
    </main>
  );
}
