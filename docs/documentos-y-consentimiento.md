# Documentos legales y consentimiento

Cómo se versionan el convenio de registro y el aviso de privacidad de cada empresa, cómo
los acepta cada persona y qué evidencia queda. Los textos base son borradores **v0.9, sin
revisión de abogado**; el sistema los trata como versiones reemplazables.

## Plantillas

| Archivo en `docs/legal/`                | Tipo                | Uso                                                                   |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `convenio-registro-jornada-v0.9.md`     | `convenio_registro` | Acuerdo patrón–trabajador sobre el registro (art. 132 fr. XXXIV LFT). |
| `aviso-privacidad-integral-v0.9.md`     | `aviso_privacidad`  | Aviso integral del patrón hacia sus trabajadores.                     |
| `aviso-privacidad-simplificado-v0.9.md` | resumen del aviso   | Lo que se muestra antes de marcar, con enlace al integral.            |

- Los archivos se cargan en `cumplimiento.plantilla` con el seed
  `supabase/seeds/0002_plantillas_legales.sql`, que **se genera** con `pnpm db:seed:legal`
  (quita el encabezado y la "nota de uso interno"). Una prueba de `packages/db` falla si el
  seed y los archivos no coinciden. `docs/legal` está fuera de Prettier: el texto se guarda
  byte por byte.
- Variables con la parte de Mustache que hace falta (`packages/dominio/src/documentos.ts`,
  `renderTemplate`): `{{variable}}`, `{{#bloque}}…{{/bloque}}`, `{{^bloque}}…{{/bloque}}`.

## Versiones de documento

Cada empresa tiene sus propias versiones en `cumplimiento.documento`. Una versión nunca se
edita; la vigente de cada tipo es la de número más alto (`cumplimiento.documentos_vigentes`).

El texto se renderiza **en dos pasos**:

1. **Al publicar la versión**, con los datos de la empresa: `razon_social`, `rfc_patron`,
   `domicilio_patron`, `correo_privacidad`, `telefono_privacidad`, `fecha_actualizacion`,
   `version_documento`. Ese texto se guarda en `contenido_md` (y `resumen_md` en el aviso) y
   sobre él se calcula `contenido_hash` = SHA-256 del texto; con resumen, del texto, un
   salto de página (`\f`) y el resumen. Un dato que falta queda como línea para llenar a
   mano (`________________`).
2. **Al mostrar o imprimir**, con los datos de la persona y de su centro:
   `nombre_trabajador`, `puesto`, `curp_trabajador`, `centro_trabajo`, `metodo_marcaje`, `captura_foto`,
   `captura_ubicacion`, `url_aviso_integral`, `hash_documento`, `fecha`.

Cuándo nace una versión:

- **Versión 1**, al terminar el alta de la empresa (`ensureDocumentos`); también al abrir
  Documentos en el panel si la empresa todavía no las tiene.
- **Versión nueva**, desde el panel → Documentos: con los datos actuales de la empresa
  (plantilla vigente de Mi Jornada) o con el texto del abogado, que puede usar las mismas
  variables. Publicar deja **pendientes** los consentimientos de ese documento.

La **CURP** se guarda cifrada con la llave del tenant. Para el convenio la descifra la
base (`tenants.curp_de_trabajador`) solo para un administrador del tenant o para la propia
persona; si no está registrada, queda la línea en blanco. El ejemplar en blanco nunca la
lleva.

RFC, domicilio y correo de privacidad se piden como opcionales en el paso 2 del alta.
Mientras falte alguno, el panel muestra "Tus documentos tienen campos vacíos" con un
enlace para completarlos.

Guardar los datos del negocio (RFC, domicilio, contacto de privacidad) no cambia las
versiones ya publicadas: hay que publicar una versión nueva para que aparezcan.

El dueño ve la leyenda "versión preliminar"; el trabajador no.

## PDF

`/panel/documentos/{id}/pdf` genera el PDF con Playwright (`apps/web/lib/pdf.ts`): Chromium de
`@sparticuz/chromium` en Vercel y el de Playwright en local y CI. Sin parámetros sale en
blanco para firma autógrafa; con `?trabajador={id}`, con los datos de esa persona. Lleva
el logo de la empresa si lo cargó (bucket `documentos`), o el de Mi Jornada, y al pie la
versión y la huella. Se genera al pedirlo; no se guarda.

## Consentimiento

Solo cuenta la aceptación de la **versión vigente**. Métodos, todos en
`cumplimiento.consentimiento` (pueden convivir para el mismo documento):

| Método            | Dónde                                                  | Qué cubre                                             | Evidencia                                                                                                                                             |
| ----------------- | ------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firma_simple`    | PWA, `/app/documentos`                                 | Aviso y convenio                                      | Nombre completo tecleado (debe coincidir con el registrado salvo acentos, mayúsculas y espacios), hora del servidor, IP, navegador, `evidencia_hash`. |
| `clic`            | Kiosco, "Acepto y marco" con PIN o QR                  | Solo el aviso de privacidad, que es lo que se muestra | Hora del servidor, IP, navegador, `evidencia_hash`.                                                                                                   |
| `firma_autografa` | Panel → Documentos, el patrón sube el ejemplar firmado | El documento firmado                                  | Archivo en el bucket `documentos` y su SHA-256 (`archivo_hash`).                                                                                      |

- `evidencia_hash = SHA-256(documento_hash | trabajador_id | nombre_tecleado | aceptado_en | ip)`,
  unidos con `|` en UTF-8; `aceptado_en` en UTC con microsegundos; nombre e IP vacíos si no
  existen. La calcula la base (`cumplimiento.calcular_evidencia`) y la réplica está en
  `packages/dominio` (`consentEvidenceHash`), con prueba cruzada.
- Las aceptaciones electrónicas pasan por funciones (`cumplimiento.aceptar_documento`,
  `cumplimiento.kiosco_aceptar`): el cliente no puede insertar una aceptación directa ni
  fijar la hora. La IP la informa el servidor de la aplicación.
- **PWA:** al entrar, si hay documentos sin aceptar se muestran primero: aviso simplificado
  con enlace al integral (`/aviso/{centro}`, público) y convenio completo, que hay que
  recorrer hasta el final antes de poder teclear el nombre. "Ahora no, solo quiero marcar"
  deja marcar.
- **Kiosco:** antes de cada marca pregunta a la API si esa persona tiene pendiente el
  aviso. Si lo tiene, lo muestra con "Acepto y marco" y "Marcar sin aceptar por ahora". Sin
  red o sin respuesta en 4 segundos, marca directo.
- **No aceptar nunca impide marcar**: la obligación de registrar es del patrón. El panel
  muestra "Consentimiento pendiente" por persona y documento
  (`cumplimiento.estado_consentimientos`).

## Pendiente de confirmar con el abogado

Está en `docs/preguntas-abogado.md`: si la firma simple basta para la "prueba plena", si el
clic del kiosco puede cubrir también el convenio y si la foto requiere consentimiento expreso.
