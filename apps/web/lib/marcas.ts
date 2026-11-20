import "server-only";
import { getDetalleMarcajes, type Ctx } from "@mijornada/api";
import { addDays } from "@mijornada/dominio";
import type { MarcaElegible } from "../components/FormularioIncidencia.tsx";
import { fechaCorta, hora, TIPOS_MARCAJE } from "./formato.ts";

/** Marcas de los últimos 14 días de una persona que se pueden pedir corregir. */
export async function marcasElegibles(
  ctx: Ctx,
  trabajadorId: string,
  hoy: string,
  zona: string,
): Promise<MarcaElegible[]> {
  const marcas = await getDetalleMarcajes(ctx, {
    trabajador_id: trabajadorId,
    desde: addDays(hoy, -14),
    hasta: hoy,
  });
  return marcas
    .filter((m) => !m.anulado)
    .reverse()
    .map((m) => ({
      id: m.evento_id,
      fecha: m.fecha,
      trabajador_id: trabajadorId,
      etiqueta: `${fechaCorta(m.fecha)} · ${TIPOS_MARCAJE[m.tipo] ?? m.tipo} ${hora(m.hora_vigente, zona)}`,
    }));
}
