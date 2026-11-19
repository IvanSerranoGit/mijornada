# Mi Jornada

Registro electrónico de jornada laboral para México (LFT art. 132 fr. XXXIV). El contrato del
proyecto y sus principios están en [`CLAUDE.md`](./CLAUDE.md).

## Requisitos

- Node.js 24 (`.nvmrc`) y pnpm 10
- Docker Desktop en ejecución
- Supabase CLI 3.2 o superior (con la 2.75 `supabase db reset` falla con un error 502)

## Entorno local

```bash
pnpm install
pnpm db:start                # Postgres, Auth y Storage en Docker
pnpm env:local               # escribe apps/*/.env.local con las llaves locales
pnpm db:reset                # aplica migraciones y seeds desde cero
pnpm dev                     # web en :3000, kiosco en :3001
```

Supabase Studio queda en http://127.0.0.1:54323 y los correos de prueba (enlace mágico) en
http://127.0.0.1:54324. Para detener el entorno: `pnpm db:stop`. Si cambias `supabase/config.toml`,
reinicia con `pnpm db:stop && pnpm db:start`.

Recorrido para probar a mano:

1. http://localhost:3000/registro → crea la cuenta y sigue el alta en 6 pasos. Anota el PIN de la
   persona y el código de enlace del kiosco.
2. En el panel, **Invitar a marcar desde su celular** genera el enlace de la PWA del trabajador
   (`/invitacion/…`); se activa con un correo y el PIN. La PWA vive en `/app`.
3. http://localhost:3001 → teclea el código de enlace para vincular el kiosco y marca con el PIN.

## Scripts

| Script            | Qué hace                                                             |
| ----------------- | -------------------------------------------------------------------- |
| `pnpm lint`       | ESLint en todos los paquetes                                         |
| `pnpm typecheck`  | TypeScript estricto en todos los paquetes                            |
| `pnpm test`       | Vitest (las de `packages/db` necesitan `pnpm db:start`)              |
| `pnpm format`     | Prettier                                                             |
| `pnpm db:migrate` | Aplica las migraciones pendientes a la base local                    |
| `pnpm db:reset`   | Recrea la base local desde cero (migraciones y seeds)                |
| `pnpm db:seed`    | Vuelve a aplicar los seeds idempotentes de `supabase/seeds`          |
| `pnpm db:types`   | Regenera los tipos TypeScript de la base (`packages/db`)             |
| `pnpm env:local`  | Escribe `apps/*/.env.local` con las llaves del entorno local         |
| `pnpm test:e2e`   | Playwright: onboarding, PWA sin red y kiosco (requiere `pnpm build`) |

Antes de dar una tarea por terminada: `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde. GitHub
Actions corre lo mismo en cada PR (`.github/workflows/ci.yml`).

## Base de datos

Todo el esquema vive en `supabase/migrations` (SQL numerado; una migración aplicada no se edita) y
se aplica desde cero con `pnpm db:reset`.

- **Un esquema por dominio**: `tenants`, `jornada`, `calculo`, `cumplimiento`, `integraciones` y
  `auditoria`. Llaves UUID v7 (`public.uuid_v7()`).
- **Bitácora inmutable**: `jornada.evento` está particionada por mes y solo acepta `INSERT`. Al
  insertar, la base fija `ts_servidor`, encadena el hash con el evento anterior del trabajador e
  ignora un `client_event_id` repetido. `jornada.verificar_cadena(tenant, trabajador)` dice si la
  cadena está íntegra y dónde se rompe.
- **Sincronización tardía**: un marcaje que llega más de 24 h después de la hora del dispositivo
  queda con `origen = 'sincronizacion_tardia'`; lo decide la base, no el cliente.
- **Verificación de reportes**: `cumplimiento.verificar_reporte(reporte)` recorre la cadena de cada
  trabajador del reporte. Es lo único, además del reporte, que puede consultar un inspector, y cada
  consulta suya queda en `auditoria.bitacora_admin`.
- **Sello diario**: un job de pg_cron corre cada hora y sella los días terminados de cada tenant a
  partir de las 02:00 de su hora local (`jornada.sello_diario`, raíz Merkle).
- **Reglas con vigencia**: `calculo.regla` se precarga con el calendario 2026-2030 desde
  `supabase/seeds`; se consulta con `calculo.regla_vigente(clave, fecha)`.
- **RLS**: todas las tablas tienen RLS. Las políticas leen los claims `tenant_id`, `rol`,
  `usuario_id`, `centro_id` y `trabajador_id`, que agrega al JWT el hook
  `tenants.claims_token_acceso` (activado en `supabase/config.toml`).

La forma canónica del hash y del árbol Merkle está documentada en las migraciones y replicada en
`packages/dominio`; las pruebas de `packages/db` comparan ambas implementaciones.

## Aplicaciones y API

- **`apps/web`**: registro e inicio de sesión del patrón, alta en 6 pasos (`/onboarding`), panel
  (`/panel`) y la PWA del trabajador (`/app`, instalable). Monta la API en `/api/v1` y sirve su
  contrato en `/api/v1/openapi.json`.
- **`apps/kiosco`**: tablet del negocio. Se vincula con un código de 8 caracteres y marca con PIN o
  QR; su API vive en `/api/v1/kiosco` y se autentica con el token del dispositivo.
- **`packages/api`**: esquemas Zod, handlers puros y adaptador HTTP. Las pantallas llaman a los
  mismos handlers que la API, así que ninguna regla vive solo en una pantalla.
- **`packages/ui`**: tema de Tailwind v4 y componentes de la identidad (Figma "Mi Jornada —
  Identidad"). Muestrario en http://localhost:3000/ui (solo en desarrollo).
- **`packages/offline`**: cola local de marcajes (IndexedDB). El marcaje se guarda primero en el
  dispositivo y se envía después; reintentar nunca duplica porque la API es idempotente por
  `client_event_id`.

Cómo se calcula el día laboral (`jornada.dia_laboral`): cuenta la hora del dispositivo si existe
(una marca hecha sin red vale a la hora en que se hizo) y, si no, la del servidor; el día es el de
la zona horaria del centro; una jornada que cruza la medianoche pertenece al día en que empezó. Se
recalcula solo al insertar cada evento y se puede reconstruir con `jornada.recalcular_rango`.

## Estructura

```
apps/web            Panel del patrón (Next.js App Router)
apps/kiosco         Kiosco de marcaje (Next.js PWA)
packages/api        Contrato y handlers de la API /api/v1
packages/dominio    Lógica pura: hash encadenado, Merkle, cálculo de horas
packages/db         Cliente de base de datos y ejecución de seeds
supabase/migrations Migraciones SQL numeradas (nunca se edita una ya aplicada)
supabase/seeds      Seeds versionados e idempotentes
```

## Infraestructura

- **GitHub**: `IvanSerranoGit/mijornada` (público). `main` solo recibe cambios por PR.
- **Vercel**: proyecto `mijornada`, raíz `apps/web`, dominios `mijornada.xyz` y `www.mijornada.xyz`.
- **DNS**: zona en Cloudflare definida en `infra/dns/mijornada.xyz.zone`; se aplica con
  `scripts/cloudflare-zona.sh` (requiere `CLOUDFLARE_API_TOKEN` en `.env.local`). SPF, DKIM y DMARC
  están en ese archivo como placeholders comentados.
- **Supabase**: solo entorno local en el sprint 1; el proyecto en la nube se crea al final del sprint 2.
