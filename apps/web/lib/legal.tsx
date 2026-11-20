import "server-only";
import { markdownToHtml, parseLegalTemplate, renderTemplate } from "@mijornada/dominio";
import { Logo } from "@mijornada/ui";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { INZOTEC } from "./inzotec.ts";

// Fecha en que se publicó la versión vigente de los textos legales de Mi Jornada.
const FECHA_ACTUALIZACION = "20 de noviembre de 2026";

/** Lee un texto legal de docs/legal y lo deja listo para mostrarse. Corre al construir el sitio. */
function cargar(archivo: string): string {
  const fuente = readFileSync(path.join(process.cwd(), "../../docs/legal", archivo), "utf8");
  return markdownToHtml(
    renderTemplate(parseLegalTemplate(fuente).contenido, {
      razon_social_inzotec: INZOTEC.razonSocial,
      rfc_inzotec: INZOTEC.rfc,
      domicilio_inzotec: INZOTEC.domicilio,
      correo_contacto: INZOTEC.correoContacto,
      correo_privacidad: INZOTEC.correoPrivacidad,
      correo_facturacion: INZOTEC.correoFacturacion,
      fecha_actualizacion: FECHA_ACTUALIZACION,
    }),
  );
}

/** Página legal pública de Mi Jornada (términos, privacidad). */
export function PaginaLegal({ archivo }: { archivo: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <Link href="/" aria-label="Mi Jornada, inicio">
        <Logo tamano={32} />
      </Link>
      <p
        role="note"
        className="rounded-(--radio-md) bg-status-warning-soft p-(--espacio-md) text-pequeno text-status-warning-text"
      >
        Versión preliminar: este texto todavía no lo ha revisado un abogado y puede cambiar.
      </p>
      <article className="documento" dangerouslySetInnerHTML={{ __html: cargar(archivo) }} />
      <p className="text-pequeno text-text-secondary">
        <Link href="/" className="underline">
          Volver al inicio
        </Link>
      </p>
    </main>
  );
}
