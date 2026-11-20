# Hash encadenado de `jornada.evento`

Cada evento guarda el SHA-256 de su contenido y del hash del evento anterior del
mismo trabajador (`hash_prev`): una cadena por trabajador. Cambiar, quitar o
insertar un evento en medio rompe la cadena a partir de ese punto.

## Forma canónica

Los campos se unen con `|` y se codifican en UTF-8. Un nulo es la cadena vacía.
Las horas van en UTC con microsegundos (`2027-01-04T15:00:00.000000Z`) y las
coordenadas con seis decimales.

## Versiones

La fórmula ha crecido sin recalcular lo ya escrito: cada evento guarda con qué
versión se creó (`hash_version`) y se verifica siempre con esa.

| Versión | Campos, en orden                                                                                                                      | Desde        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1       | `hash_prev`, `tenant_id`, `trabajador_id`, `tipo`, `ts_servidor`, `ts_dispositivo`, `origen`, `lat`, `lng`, `foto_hash`, `creado_por` | Migración 9  |
| 2       | `"v2"`, los once campos de la versión 1, `ts_declarado`                                                                               | Migración 22 |
| 3       | `"v3"`, los once campos de la versión 1, `ts_declarado`, `foto_estado`, `foto_motivo`                                                 | Migración 23 |

Los eventos nuevos siempre usan la versión más reciente. Un evento de versión 1
o 2 no se toca: `foto_estado` nulo significa "anterior a la versión 3".

## Dónde vive

- **Base (fuente de verdad):** `jornada.calcular_hash_evento` (v1),
  `jornada.calcular_hash_evento_v2`, `jornada.calcular_hash_evento_v3`.
  `jornada.hash_de_evento(evento)` elige la fórmula según `hash_version`. El
  trigger `jornada.encadenar_evento` fija `ts_servidor`, `hash_prev`,
  `hash_version` y `hash` al insertar; el cliente no puede mandarlos.
- **Réplica en TypeScript:** `packages/dominio/src/hash.ts`
  (`canonicalEventString`, `computeEventHash`, `verifyChain`). Sirve para
  verificar una cadena fuera de la base (reportes, auditoría).
- **Verificación:** `jornada.verificar_cadena(tenant, trabajador[, desde, hasta])`
  devuelve si la cadena está íntegra, cuántos eventos recorrió y el primer punto
  de ruptura. `cumplimiento.verificar_reporte` la usa para cada trabajador de un
  reporte.

## Pruebas

- `packages/dominio/test/hash.test.ts`: forma canónica y vectores fijos por versión.
- `packages/db/test/bitacora.test.ts` y `correccion.test.ts`: prueba cruzada. El
  hash que calcula la base coincide con el de `packages/dominio`, una cadena con
  eventos de las versiones 1, 2 y 3 verifica íntegra en ambos lados, y alterar un
  campo cubierto por el hash (incluido `foto_estado`) se detecta.

## Cómo agregar una versión

1. Migración nueva con `calcular_hash_evento_vN`, el caso nuevo en
   `hash_de_evento`, el `check` de `hash_version` y `encadenar_evento` usando N.
2. La misma fórmula en `packages/dominio/src/hash.ts`.
3. Prueba cruzada con eventos de todas las versiones.
4. Actualizar este documento.

El sello diario (`jornada.sello_diario`) guarda la raíz Merkle de los hashes de
los eventos del día por tenant; no depende de la versión de cada hash.
