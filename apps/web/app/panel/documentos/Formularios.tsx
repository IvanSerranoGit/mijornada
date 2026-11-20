"use client";

import type { TipoDocumento } from "@mijornada/api";
import { Boton, Campo } from "@mijornada/ui";
import { useActionState, useState } from "react";
import {
  guardarDatosLegales,
  publicarVersion,
  subirFirma,
  subirLogo,
  type Resultado,
} from "./actions.ts";

function Aviso({ estado }: { estado: Resultado }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-pequeno text-status-critical">
        {estado.error}
      </p>
    );
  }
  return estado.ok ? (
    <p role="status" className="text-pequeno text-text-brand">
      {estado.ok}
    </p>
  ) : null;
}

export interface DatosLegales {
  rfc: string | null;
  domicilio: string | null;
  correo_privacidad: string | null;
  telefono_privacidad: string | null;
}

/** Datos del patrón que aparecen en el convenio y en el aviso de privacidad. */
export function DatosLegalesForm({ datos }: { datos: DatosLegales }) {
  const [estado, accion, enviando] = useActionState(guardarDatosLegales, {});
  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <div className="grid gap-(--espacio-md) sm:grid-cols-2">
        <Campo
          etiqueta="RFC"
          name="rfc"
          defaultValue={datos.rfc ?? ""}
          autoCapitalize="characters"
        />
        <Campo
          etiqueta="Teléfono para asuntos de privacidad"
          name="telefono_privacidad"
          type="tel"
          defaultValue={datos.telefono_privacidad ?? ""}
        />
      </div>
      <Campo etiqueta="Domicilio" name="domicilio" defaultValue={datos.domicilio ?? ""} />
      <Campo
        etiqueta="Correo para asuntos de privacidad"
        name="correo_privacidad"
        type="email"
        defaultValue={datos.correo_privacidad ?? ""}
        nota="Aquí escribirá tu equipo para ejercer sus derechos sobre sus datos."
      />
      <div className="flex flex-wrap items-center gap-(--espacio-sm)">
        <Boton type="submit" estilo="secundario" disabled={enviando}>
          Guardar datos
        </Boton>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

/** Logo del negocio para los PDF. */
export function LogoForm({ cargado }: { cargado: boolean }) {
  const [estado, accion, enviando] = useActionState(subirLogo, {});
  return (
    <form action={accion} className="flex flex-wrap items-center gap-(--espacio-xs)">
      <label className="flex flex-col gap-(--espacio-2xs) text-pequeno font-medium">
        Logo para tus PDF {cargado ? "(ya cargaste uno; puedes cambiarlo)" : "(opcional)"}
        <input
          type="file"
          name="logo"
          required
          accept="image/png,image/jpeg,image/webp"
          className="font-normal"
        />
      </label>
      <Boton type="submit" estilo="fantasma" disabled={enviando}>
        Subir logo
      </Boton>
      <Aviso estado={estado} />
    </form>
  );
}

/** Publica una versión nueva de un documento: con la plantilla o con el texto del abogado. */
export function PublicarVersion({
  tipo,
  conResumen,
}: {
  tipo: TipoDocumento;
  conResumen: boolean;
}) {
  const [estado, accion, enviando] = useActionState(publicarVersion, {});
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex flex-col gap-(--espacio-sm)">
      <div className="flex flex-wrap items-center gap-(--espacio-xs)">
        <form action={accion}>
          <input type="hidden" name="tipo" value={tipo} />
          <Boton type="submit" estilo="fantasma" disabled={enviando}>
            Publicar versión nueva con mis datos actuales
          </Boton>
        </form>
        <Boton
          estilo="fantasma"
          aria-expanded={abierto}
          onClick={() => {
            setAbierto(!abierto);
          }}
        >
          Subir el texto de mi abogado
        </Boton>
      </div>
      {abierto ? (
        <form action={accion} className="flex flex-col gap-(--espacio-sm)">
          <input type="hidden" name="tipo" value={tipo} />
          <label className="flex flex-col gap-(--espacio-xs) text-pequeno font-medium">
            Texto completo
            <textarea
              name="contenido_md"
              required
              rows={10}
              className="w-full rounded-(--radio-md) border border-border-default bg-bg-surface p-(--espacio-md) text-pequeno font-normal"
            />
          </label>
          {conResumen ? (
            <label className="flex flex-col gap-(--espacio-xs) text-pequeno font-medium">
              Versión simplificada (la que se muestra antes de marcar)
              <textarea
                name="resumen_md"
                required
                rows={4}
                className="w-full rounded-(--radio-md) border border-border-default bg-bg-surface p-(--espacio-md) text-pequeno font-normal"
              />
            </label>
          ) : null}
          <p className="text-pequeno text-text-secondary">
            Puedes usar las mismas variables de la plantilla, por ejemplo {"{{razon_social}}"} o{" "}
            {"{{nombre_trabajador}}"}. Al publicar, tu equipo tendrá que aceptar de nuevo.
          </p>
          <div>
            <Boton type="submit" disabled={enviando}>
              Publicar esta versión
            </Boton>
          </div>
        </form>
      ) : null}
      <Aviso estado={estado} />
    </div>
  );
}

/** Sube el ejemplar firmado a mano por una persona. */
export function SubirFirma({
  trabajadorId,
  documentoId,
}: {
  trabajadorId: string;
  documentoId: string;
}) {
  const [estado, accion, enviando] = useActionState(subirFirma, {});
  return (
    <form action={accion} className="flex flex-wrap items-center gap-(--espacio-xs)">
      <input type="hidden" name="trabajador_id" value={trabajadorId} />
      <input type="hidden" name="documento_id" value={documentoId} />
      <input
        type="file"
        name="archivo"
        required
        accept="application/pdf,image/jpeg,image/png,image/webp"
        aria-label="Ejemplar firmado (PDF o foto)"
        className="max-w-56 text-nota"
      />
      <Boton type="submit" estilo="fantasma" disabled={enviando}>
        Subir firma
      </Boton>
      <Aviso estado={estado} />
    </form>
  );
}
