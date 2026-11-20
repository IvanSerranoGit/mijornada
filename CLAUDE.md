# Mi Jornada — contrato del proyecto

Producto SaaS de Inzotec para el registro electrónico de jornada laboral en México (LFT art. 132 fr. XXXIV, obligatorio desde el 1-ene-2027). Cliente inicial: microempresas de 1 a 30 personas sin área de RH. Debe escalar a medianas, conectarse a nóminas y ser el primer módulo de un ERP.

Documento de fundamentos (fuente de verdad): https://claude.ai/artifact/D1qpNxvGxGTdGqgEyyFsa8
Investigación legal y de mercado: https://claude.ai/artifact/HfRakpae4yz4oBcX7gs7WL

## Principios que no se negocian

1. La bitácora de jornada (`jornada.evento`) es append-only. Nunca UPDATE ni DELETE. Toda corrección es un evento nuevo que referencia al original.
2. API-first: web, PWA, kiosco, apps nativas y ERP consumen la misma API `/api/v1`. Ninguna lógica de negocio vive solo en una pantalla.
3. Multi-tenant por fila: toda tabla de negocio lleva `tenant_id` y política RLS. El rol de servicio solo se usa en jobs del servidor.
4. Reglas con vigencia: jornada máxima, topes de horas extra y UMA se leen de `calculo.regla` por fecha. Nunca constantes en el código.
5. Cumplimiento como módulo: consentimientos, reportes para inspección y exportadores viven en sus propios dominios para absorber los lineamientos de la STPS sin tocar el registro.
6. Minimización de datos: sin biometría. Foto y ubicación solo en el instante del marcaje; fotos purgadas a 90 días.
7. Offline primero en el marcaje: cola local, sincronización idempotente por `client_event_id`, `ts_servidor` lo fija la API.
8. Todo en español: nombres de dominio, tablas, columnas, mensajes de error y commits. Código (variables, funciones) en inglés.

## Dominios y esquemas de Postgres

- `tenants`: empresa, centro_trabajo, usuario, trabajador, horario
- `jornada`: evento (inmutable, hash encadenado), dia_laboral (derivada), sello_diario
- `calculo`: regla (vigencias 2026-2030), resumen_periodo
- `cumplimiento`: documento, consentimiento, incidencia, reporte
- `integraciones`: conector, exportacion
- `auditoria`: bitacora_admin

Las tablas derivadas (`dia_laboral`, `resumen_periodo`) deben poder reconstruirse desde cero a partir de `jornada.evento`.

## Stack

- Monorepo Turborepo con pnpm: `apps/web` (Next.js App Router, TypeScript, Tailwind), `apps/kiosco` (Next.js PWA), `packages/api` (route handlers, Zod, OpenAPI), `packages/dominio` (lógica pura, sin dependencias de framework), `packages/db` (Drizzle, migraciones SQL en `supabase/migrations`).
- Supabase: Postgres, Auth, Storage, Vault, pg_cron. Desarrollo con `supabase start` (local). Producción en el proyecto `mijornada`.
- Vercel para hosting; Cloudflare para DNS de mijornada.xyz; Cloudflare R2 para respaldos.
- PDF con Playwright. Pagos con Stripe (Mercado Pago después).
- Pruebas: Vitest para `packages/dominio` y la cadena de hashes; Playwright para flujos de marcaje.

## Reglas de trabajo

- Cada migración es un archivo SQL numerado en `supabase/migrations`; nunca se edita una migración ya aplicada.
- Antes de marcar una tarea como terminada: `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde.
- Commits pequeños con mensaje en español en imperativo ("Agrega trigger de inmutabilidad en jornada.evento").
- Una rama por sprint o por funcionalidad; PR hacia `main` con descripción de qué cambió y cómo probarlo.
- No instalar dependencias nuevas sin anotarlas en el PR con la razón.
- Si una decisión no está en el documento de fundamentos, detente y pregunta antes de implementar.

## Hash encadenado (referencia)

`hash = SHA-256(hash_prev || tenant_id || trabajador_id || tipo || ts_servidor || ts_dispositivo || origen || lat || lng || foto_hash || creado_por)`, donde `hash_prev` es el hash del evento anterior del mismo trabajador (cadena por trabajador). El sello diario guarda la raíz Merkle de los eventos del día por tenant.

Esa es la versión 1. La versión 2 agrega `ts_declarado` y la 3 `foto_estado` y `foto_motivo`; cada evento se verifica con su versión (`hash_version`). Detalle en `docs/hash-encadenado.md`.

## Calendario legal (precargar en `calculo.regla`)

| Vigente desde | Jornada máx. semanal | Tope extra semanal | Tope extra diario | Jornada total máx. diaria |
| --- | --- | --- | --- | --- |
| 2026-01-01 | 48 h | 9 h | 4 h (máx. 4 días) | 12 h |
| 2027-01-01 | 46 h | 9 h | 4 h | 12 h |
| 2028-01-01 | 44 h | 10 h | 4 h | 12 h |
| 2029-01-01 | 42 h | 11 h | 4 h | 12 h |
| 2030-01-01 | 40 h | 12 h | 4 h | 12 h |

UMA 2026: $117.31 diarios. Multa art. 994 IV Bis: 250 a 5,000 UMA. Menores de 18 años: sin tiempo extraordinario.
