# Marcaje sin conexión, foto y diagnóstico

Cómo registran una marca la PWA del trabajador (`apps/web/app/app`) y el kiosco
(`apps/kiosco`), qué pasa cuando no hay red y cómo se diagnostica un fallo en un
dispositivo. El código compartido vive en `packages/offline`.

## Flujo de una marca

1. **Se guarda en el dispositivo.** La marca entra a la cola local (`ColaMarcajes`,
   IndexedDB) con su `client_event_id` (UUID v7) y la hora del dispositivo
   (`ts_dispositivo`). Desde ese momento no se pierde aunque se cierre la página.
2. **Se envía.** La cola manda los pendientes en orden a `POST /api/v1/eventos`
   (kiosco: `/api/v1/kiosco/…`). El servidor fija `ts_servidor` y encadena el hash.
3. **Se sube la foto**, si la hay, a la ruta que devuelve el servidor (`foto_url`).

El envío es idempotente por `client_event_id`: reintentar nunca duplica un evento.

## Estados que ve la persona

| Texto en pantalla                                                                            | Significado                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| "Entrada/Salida **registrada** a las HH:MM"                                                  | El servidor ya tiene el evento.                              |
| "Entrada/Salida **guardada en este teléfono** a las HH:MM" + "N marcas pendientes de enviar" | Está en la cola local; todavía no llega al servidor.         |
| "Una marca no se pudo registrar"                                                             | El servidor la rechazó (no se reintenta); muestra el motivo. |

"Registrada" solo se muestra cuando el servidor confirmó. Una marca pendiente ya
cuenta para decidir si lo siguiente es entrada o salida, para que nadie la repita.

## Reintentos

La cola se reintenta al abrir la pantalla, cada 30 segundos, al volver la conexión
(evento `online`) y cuando el service worker recibe la sincronización en segundo
plano (`cola-marcajes`, solo en navegadores que la soportan; Safari no). Con la
aplicación cerrada no se envía nada: se envía al volver a abrirla.

Se reintenta ante falta de red, HTTP 401, 429 y 5xx. Cualquier otro error del
servidor es un rechazo. Un evento que llega más de 24 h después de su
`ts_dispositivo` queda con origen `sincronizacion_tardia` (lo decide el servidor).

## Foto

- La foto nunca bloquea la marca: si no se puede procesar o guardar, la marca se
  registra sin ella y la pantalla lo avisa.
- En la cola la foto se guarda como bytes (`ArrayBuffer`), no como `Blob`: Safari
  falla al guardar un `Blob` en IndexedDB ("Error preparing Blob/File data to be
  stored in object store"). Lo cubre `e2e/foto.spec.ts` en el proyecto `iphone`.

## Diagnóstico de dispositivos

Los dispositivos avisan sus errores a `POST /api/diagnostico` (`reportarError`).
El aviso lleva dónde falló, el mensaje técnico y el navegador; sin datos
personales. Queda en los registros de Vercel con el prefijo `[dispositivo]`:

```sh
vercel logs -p mijornada --no-branch --environment production --since 2h -q dispositivo -x
```

| `donde`                            | Qué significa                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `pwa:marcar`, `kiosco:marcar`      | Falló guardar la marca en el dispositivo.                               |
| `pwa:foto`                         | No se pudo procesar la foto; la marca siguió sin ella.                  |
| `cola:enviada-tras-reintentos`     | Una marca llegó después de N envíos fallidos; incluye el último motivo. |
| `ventana:error`, `ventana:promesa` | Error no atrapado en la página.                                         |
| `global:/ruta`                     | La aplicación no pudo arrancar y se mostró la pantalla de error.        |

Mientras el envío falla puede no haber red para avisar; por eso el motivo se
guarda junto a la marca y se avisa cuando por fin llega.

## Caso real: 19-nov-2026 (verificación de producción)

Un iPhone conectado por Wi-Fi mostraba páginas que no cargaban y una marca que
se quedaba pendiente. El servidor no recibía ninguna petición de ese teléfono;
al pasar a datos celulares la marca llegó sola, con foto y ubicación, y la
cadena verificó íntegra. La causa fue la conexión de esa red hacia el sitio, no
la aplicación. Lo que se corrigió a raíz del caso: el texto decía "registrada"
aunque la marca seguía en el teléfono, y los envíos fallidos no dejaban rastro.
