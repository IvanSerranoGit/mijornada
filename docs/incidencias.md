# Incidencias y correcciones

Nadie edita una marca. `jornada.evento` solo acepta `INSERT`; un error se corrige con una
**incidencia** que, al aprobarse, inserta un evento nuevo. La marca original, el motivo,
quién autorizó y cuándo se conservan siempre.

## Tipos

| Tipo                                          | Qué pide                                   | Evento que inserta al aprobarse                                                |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `olvido`                                      | Registrar una marca que faltó, con su hora | El marcaje (`entrada`, `salida`…) con `origen = 'incidencia'` y `ts_declarado` |
| `correccion_hora`                             | Cambiar la hora de una marca existente     | `correccion` que apunta a la marca original, con `ts_declarado`                |
| `permiso`, `home_office`, `falta_justificada` | Dejar constancia                           | `aprobacion`                                                                   |

El día laboral (`jornada.dia_laboral`) usa la hora declarada y queda en estado
`corregido`. Los eventos nuevos se encadenan con el hash vigente (versión 3).

## Flujo

1. **Abrir.** La propia persona (PWA, `/app/incidencias`) o el patrón (panel,
   `/panel/incidencias`). Se captura la fecha y la hora **locales del centro**;
   `cumplimiento.abrir_incidencia` arma `ts_declarado` con la zona horaria del centro.
2. **Resolver.** Un dueño, administrador o el supervisor del centro aprueba o rechaza
   (`cumplimiento.resolver_incidencia`). El cliente no puede cambiar el estado directo.
3. **Conformidad del trabajador.**
   - Si la abrió la propia persona, nace con su conformidad.
   - Si la abrió el patrón, la persona responde una sola vez desde su celular
     (`cumplimiento.responder_incidencia`): conforme, o inconforme con un comentario
     obligatorio. Responder no cambia la resolución; deja asentada su postura.
   - Sin respuesta, el panel y el reporte dicen "sin conformidad del trabajador".

## Plazo para reportar

`calculo.regla` → `dias_para_reportar_incidencia` (hoy **5 días hábiles**, lunes a viernes
sin festivos; `supabase/seeds/0003_regla_incidencias.sql`). Una incidencia abierta después
de ese plazo queda con `extemporanea = true`: es un aviso ("Fuera de plazo") en el panel y
en el reporte; **no se bloquea**. Para cambiar el plazo se cierra la vigencia y se agrega
una fila nueva. Es provisional: pregunta 9 de `docs/preguntas-abogado.md`.

## Vista del día y fuente del reporte

`jornada.detalle_marcajes(tenant, trabajador, desde, hasta)` devuelve cada marcaje con:

- `hora_original` (nula si el marcaje nació de un olvido) y `hora_vigente`;
- la corrección: `correccion_motivo`, `correccion_autorizo`, `correccion_registrada_en`;
- la incidencia: tipo, quién la solicitó, `conformidad` (`conforme`, `inconforme`,
  `sin_respuesta`), comentario del trabajador y si fue extemporánea;
- `foto_estado`, `fuera_de_geocerca` y si la marca fue anulada.

La usan la vista del día del panel (`/panel/dia`), que muestra original y corrección lado
a lado, y el reporte para inspección. Solo la puede llamar quien puede ver a esa persona.

## API

| Ruta                                       | Qué hace                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| `GET /api/v1/incidencias`                  | Lista con filtros `estado`, `centro_id`, `trabajador_id` |
| `POST /api/v1/incidencias`                 | Abre una incidencia                                      |
| `POST /api/v1/incidencias/{id}/resolucion` | Aprueba o rechaza                                        |
| `POST /api/v1/incidencias/{id}/respuesta`  | Conformidad o inconformidad del trabajador               |
| `GET /api/v1/marcajes`                     | Detalle de marcajes de una persona entre dos fechas      |

## Pruebas

`packages/db/test/correccion.test.ts` (reglas, respuesta, plazo, detalle) y
`e2e/incidencia.spec.ts` (flujo completo en la interfaz).
