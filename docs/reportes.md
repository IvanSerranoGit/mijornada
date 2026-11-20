# Reportes, acceso de inspector y verificación

Qué contiene el reporte para inspección, cómo se generan sus archivos, qué huellas lo
respaldan y cómo lo consulta un inspector.

## Generación

`POST /api/v1/reportes` (panel → Reportes). Solo dueño o administrador.

| Campo            | Valor                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| `tipo`           | `inspeccion`, `periodo` o `trabajador` (este último, una sola persona) |
| `desde`, `hasta` | Fechas del periodo (máximo un año), en la zona horaria de la empresa   |
| `centro_id`      | Opcional: limita el reporte a un centro                                |
| `trabajador_ids` | Opcional: limita el reporte a ciertas personas                         |

Se generan tres archivos en el bucket privado `reportes`, en `<tenant>/<reporte>/`:

| Archivo       | Contenido                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------- |
| `reporte.pdf` | El reporte, con Playwright (`apps/web/lib/pdf.ts`)                                          |
| `eventos.csv` | Eventos crudos del periodo: todas las columnas de `jornada.evento` menos la ruta de la foto |
| `dias.csv`    | `jornada.dia_laboral` del periodo                                                           |

Los CSV van en UTF-8 con BOM y saltos `\r\n` (RFC 4180) para abrirse bien en hojas de
cálculo. La fila queda en `cumplimiento.reporte` (`cumplimiento.registrar_reporte`).

`packages/api` arma los datos (`buildReporte`) y el HTML (`reporteHtml`, función pura); el
servidor que monta la API aporta el PDF, el QR y el cliente de servicio (`Servicios`).

## Contenido del PDF, en orden

1. **Carátula:** patrón, RFC, domicilio, centro, periodo, personas, eventos, fecha de
   generación, hash raíz del periodo, huella del CSV de eventos, y QR con la URL de
   verificación.
2. **Por persona:** registro diario (fecha, entrada, salida, pausas, tiempo trabajado,
   medio, estado original/corregido/incompleto); debajo, las correcciones (hora original,
   hora declarada, motivo, quién autorizó, cuándo, conformidad del trabajador, y si la
   incidencia fue extemporánea); y el resumen semanal de horas ordinarias y extra dobles
   y triples contra los topes vigentes de `calculo.regla`.
3. **Estado de consentimientos** por persona y documento vigente.
4. **Notas del periodo:** marcas con sincronización tardía y fotos no disponibles.
5. **Acta de integridad:** resultado de `jornada.verificar_cadena` por persona y los
   sellos diarios del periodo.

Las horas se muestran en la zona horaria de cada centro.

## Huellas

| Huella           | Qué es                                                                                                                         | Dónde aparece                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `hash_contenido` | SHA-256 de `eventos.csv`, byte por byte                                                                                        | Carátula, pie de cada página, página de verificación |
| `hash_raiz`      | Raíz Merkle de los hashes de los eventos del reporte, en orden de `(ts_servidor, id)` (misma construcción que el sello diario) | Carátula, página de verificación                     |

Quien reciba el CSV puede calcular su SHA-256 y compararlo con el del PDF.

## Verificación pública

`/verificar/<token>`: el token (48 hexadecimales) solo existe en el PDF, como QR y URL; en
la base queda su hash. La página **recalcula las cadenas al abrirse**
(`cumplimiento.verificacion_publica`) y muestra íntegro o no íntegro, cuántos registros
verificó, los días sellados y las dos huellas. No muestra datos personales ni el nombre
del patrón.

## Acceso de inspector

Desde el reporte, el dueño crea un **enlace temporal** (`/inspector/<token>`, 72 horas,
revocable). El enlace se muestra una sola vez.

- Al crearlo se da de alta una cuenta de Auth sin correo real y un `tenants.usuario` con
  rol `inspector` ligado a ese reporte (`cumplimiento.crear_acceso_inspector`).
- Al abrir el enlace, el servidor canjea el token por una sesión
  (`cumplimiento.acceso_inspector_por_token`, solo para el rol de servicio) y lleva al
  inspector a `/inspector`.
- El inspector ve **solo ese reporte**: la verificación (`cumplimiento.verificar_reporte`),
  el PDF y los dos CSV. RLS no le deja leer eventos, personas ni otros reportes.
- Queda rastro en `auditoria.bitacora_admin` de cada vez que abre el reporte, lo verifica
  o descarga un archivo, con hora e IP. El dueño lo ve en el panel ("Actividad del
  inspector", `cumplimiento.consultas_de_inspector`). La verificación registra la IP que
  ve la base (la del servidor de la aplicación); las demás, la del navegador del inspector.
- Vencido o revocado, la sesión abierta deja de servir y el enlace ya no abre otra.

## API

| Ruta                                             | Qué hace                                               |
| ------------------------------------------------ | ------------------------------------------------------ |
| `GET /api/v1/reportes`                           | Reportes generados                                     |
| `POST /api/v1/reportes`                          | Genera un reporte; devuelve también `url_verificacion` |
| `GET /api/v1/reportes/{id}/verificacion`         | Verifica las cadenas del reporte                       |
| `GET /api/v1/reportes/{id}/accesos`              | Accesos de inspector                                   |
| `POST /api/v1/reportes/{id}/accesos`             | Crea un enlace de inspector                            |
| `GET /api/v1/reportes/{id}/consultas`            | Rastro del inspector                                   |
| `POST /api/v1/accesos-inspector/{id}/revocacion` | Revoca un acceso                                       |

Los archivos se descargan en `/reportes/{id}/{pdf|eventos|dias}` (fuera de `/api/v1` porque
no son JSON), con los permisos de quien llama.

## Pruebas

`packages/api/test/reportes.test.ts` (huellas, orden del contenido, permisos, inspector,
revocación, verificación pública) y `e2e/reporte.spec.ts` (flujo en la interfaz con el PDF
real).
