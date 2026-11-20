import "server-only";
import { createIncidencia, incidenciaCrear, type Ctx } from "@mijornada/api";
import { campo } from "./acciones.ts";

/** Abre una incidencia con los campos del formulario (los mismos en el panel y en la PWA). */
export async function abrirDesdeFormulario(
  ctx: Ctx,
  formData: FormData,
  trabajadorId: string | undefined,
) {
  const tipo = campo(formData, "tipo");
  const referido = campo(formData, "evento_referido_id");
  return createIncidencia(
    ctx,
    incidenciaCrear.parse({
      trabajador_id: trabajadorId,
      fecha: campo(formData, "fecha"),
      tipo,
      motivo: campo(formData, "motivo") ?? "",
      hora: campo(formData, "hora"),
      ...(tipo === "olvido" ? { tipo_marcaje: campo(formData, "tipo_marcaje") } : {}),
      ...(tipo === "correccion_hora" && referido !== undefined
        ? { evento_referido_id: referido }
        : {}),
    }),
  );
}
