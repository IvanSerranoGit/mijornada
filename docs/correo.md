# Correo

Dos caminos, los dos con Resend y remitente `Mi Jornada <hola@mijornada.xyz>`:

| Camino                                | Qué envía                                                                           | Dónde se configura                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Supabase Auth por SMTP**            | Confirmación de cuenta, enlace mágico, recuperación de contraseña, cambio de correo | `infra/supabase-produccion/supabase/config.toml` y `templates/` (HTML en español) |
| **API de Resend desde la aplicación** | Invitaciones, recordatorios y avisos del producto                                   | `packages/api/src/correo.ts`; variables `RESEND_API_KEY` y `CORREO_REMITENTE`     |

Sin `RESEND_API_KEY` la aplicación no envía nada: lo anota en el registro del servidor y
el aviso queda pendiente. Así funciona en local, en pruebas y mientras el dominio no esté
verificado.

## Correos de la aplicación

Todos salen de `plantillaCorreo` (HTML con la identidad de Mi Jornada y versión en texto
plano; el contenido se escapa).

| Correo                                  | A quién                                    | Cuándo                                                                                            |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Invitación a trabajador                 | La persona                                 | El patrón genera su enlace y captura su correo (opcional; también puede compartirlo por WhatsApp) |
| Invitación a administrador o supervisor | La persona invitada                        | Al invitarla (`POST /api/v1/usuarios`)                                                            |
| Recordatorio de consentimiento          | La persona (si ya tiene cuenta) y el dueño | A los 3 y a los 7 días con documentos sin aceptar                                                 |
| Prueba por vencer                       | El dueño                                   | Día 10 y día 13 de los 14                                                                         |
| Pago fallido                            | El dueño                                   | Día 0 (lo dispara el webhook de Stripe), día 3 y día 6 de la gracia                               |
| Incidencia por resolver                 | El dueño                                   | Cuando hay incidencias pendientes                                                                 |
| Incidencia por responder                | La persona                                 | Cuando su empresa abrió una y falta su respuesta                                                  |

## Avisos diarios

`GET /api/cron/diario` (Vercel Cron, 14:00 UTC, con `CRON_SECRET`) hace tres cosas: purga
las fotos de más de 90 días, envía los avisos que tocan y ajusta en Stripe las personas
adicionales del plan Crecimiento.

- `tenants.avisos_pendientes()` calcula **en la base** qué avisos tocan hoy y a quién
  (plazos incluidos), y excluye los ya enviados.
- `enviarAvisosPendientes` los envía y los anota en `tenants.aviso_enviado`. Los avisos al
  dueño sobre su equipo y sobre incidencias se juntan en un solo correo por empresa.
- Si un envío falla, no se anota: se reintenta en la siguiente corrida.
- Como el cron es diario, los avisos de incidencias pueden tardar hasta un día.

## Buzones

`hola@mijornada.xyz` (contacto), `privacidad@mijornada.xyz` (datos personales) y
`facturacion@mijornada.xyz` (facturas) aparecen en el sitio y en los documentos. Su
recepción se configura con Cloudflare Email Routing (`infra/dns/mijornada.xyz.zone`).

## Pruebas

`packages/api/test/correo.test.ts`: plantilla, recordatorios a 3 y 7 días sin repetir,
reintento cuando el envío falla, prueba por vencer, pago fallido días 3 y 6, e incidencias.
