# Planes, prueba y cobro con Stripe

## Planes

Precios en pesos, **con IVA incluido** (es lo que ve el cliente; la factura de Stripe
desglosa el IVA). El anual cuesta diez meses.

| Plan        | Personas incluidas                           | Mensual                     | Anual  |
| ----------- | -------------------------------------------- | --------------------------- | ------ |
| Prueba      | 60                                           | Gratis 14 días, sin tarjeta | —      |
| Básico      | 10                                           | $299                        | $2,990 |
| Negocio     | 30                                           | $599                        | $5,990 |
| Crecimiento | 60, después $20 por persona adicional al mes | $999                        | $9,990 |

El catálogo vive en `packages/api/src/pagos.ts` (`PLANES`) y el límite por plan también en
la base (`tenants.limite_de_plan`). Los precios se buscan en Stripe por su `lookup_key`
(`mijornada_<plan>_<mensual|anual>`, `mijornada_asiento_<ciclo>`), no por su id: así el
mismo código sirve en modo de prueba y en modo real.

## Estado de la cuenta y bloqueo suave

`tenants.estado_de_cuenta(tenant)` (API: `GET /api/v1/cuenta`) devuelve el plan, el límite,
las personas activas y el **acceso**:

| Situación                          | Acceso                                                        | Motivo                                            |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Prueba vigente o plan al corriente | `completo`                                                    | —                                                 |
| Prueba vencida sin plan            | `solo_lectura`                                                | `prueba_vencida`                                  |
| Cobro fallido, dentro de la gracia | `completo`, con aviso en el panel y por correo (día 0, 3 y 6) | —                                                 |
| Cobro fallido, vencida la gracia   | `solo_lectura`                                                | `pago_fallido`                                    |
| Suscripción cancelada              | `solo_lectura`                                                | `prueba_vencida` (vuelve a "prueba" ya consumida) |

La gracia tras un cobro fallido son los días de `calculo.regla` → `dias_gracia_pago` (hoy
**7**; `supabase/seeds/0004_regla_gracia_pago.sql`). `estado_de_cuenta` devuelve
`pago_fallido_en` y `gracia_hasta`.

En **solo lectura** la API responde `402 solo_lectura` a la administración: altas y cambios
de personas, centros, horarios, documentos, kioscos, invitaciones y usuarios
(`requireCuentaActiva`, en `packages/api/src/cuenta.ts`).

Lo que **nunca** se bloquea, porque es el registro legal o el acceso a los datos:

- marcar (PWA y kiosco) y aceptar documentos;
- abrir, resolver y responder incidencias;
- consultar todo y generar y descargar reportes (una inspección no espera a un pago);
- contratar o regularizar el plan.

Nada se borra ni se oculta por falta de pago.

El **límite de personas** es un aviso: se puede dar de alta por encima del límite y el
panel sugiere subir de plan. En Crecimiento, las personas adicionales se cobran: un cron
diario ajusta la cantidad en Stripe (`sincronizarAsientos`).

El plan y los datos de Stripe solo los escribe el servidor
(`tenants.aplicar_evento_stripe`, rol de servicio). Ni el dueño puede cambiarse de plan
por la API: se revocó ese permiso.

## Flujo de cobro

1. **Checkout** (`POST /api/v1/cuenta/checkout`, panel → Plan): solo el dueño. Abre el
   Checkout de Stripe en modo suscripción, con cupones habilitados y la tasa de IVA. Si la
   prueba sigue vigente (más de 49 h), el primer cobro se hace al terminarla.
2. **Webhook** (`POST /api/stripe/webhook`): comprueba la firma con el cuerpo tal como
   llegó y aplica el cambio. Es idempotente (`tenants.evento_stripe`).

   | Evento                                      | Efecto                                                                                              |
   | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
   | `checkout.session.completed`                | Liga la empresa con el cliente y la suscripción                                                     |
   | `customer.subscription.created` / `updated` | Plan, ciclo y fin de periodo; al corriente limpia el aviso de pago, `past_due`/`unpaid` lo enciende |
   | `customer.subscription.deleted`             | Vuelve a "prueba" consumida: solo lectura                                                           |
   | `invoice.payment_failed`                    | Enciende el aviso de pago fallido                                                                   |

3. **Portal** (`POST /api/v1/cuenta/portal`): portal de facturación de Stripe para cambiar
   de plan o de tarjeta, o cancelar.

`cambioDeEvento` es una función pura (evento → cambio en la empresa), probada sin red.

## Factura fiscal (CFDI)

No se emite automáticamente en este sprint. El panel guarda RFC, régimen fiscal, código
postal y uso de CFDI (`PATCH /api/v1/cuenta/facturacion`) y dice que la factura se
solicita a `facturacion@mijornada.xyz`; Inzotec la emite a mano.

## Configuración

| Variable (solo servidor) | Para qué                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`      | Llave secreta: `sk_test_…` en local y preview, `sk_live_…` en producción |
| `STRIPE_WEBHOOK_SECRET`  | Secreto de firma del webhook (`whsec_…`)                                 |

Sin `STRIPE_SECRET_KEY`, las rutas de cobro responden `503 pagos_no_disponibles` y el
resto del producto funciona igual.

Alta de productos, precios, tasa de IVA y cupones (idempotente):

```sh
STRIPE_SECRET_KEY=sk_test_... node packages/api/src/stripe-setup.ts
# En modo real exige --vivo; no se ejecuta sin confirmación del dueño del producto.
```

En local, para recibir el webhook: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Pruebas

`packages/api/test/pagos.test.ts`: firma válida, inválida y cuerpo alterado; traducción de
eventos; prueba → checkout → activa → pago fallido → regularización → cancelación; qué
queda bloqueado y qué no en solo lectura; evento repetido y evento ajeno.
`packages/db/test/rls.test.ts`: nadie cambia el plan desde la API.
