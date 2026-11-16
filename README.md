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
cp .env.example .env.local   # completa las llaves con `supabase status -o env`
pnpm db:start                # Postgres, Auth y Storage en Docker
pnpm db:reset                # aplica migraciones y seeds desde cero
pnpm dev                     # web en :3000, kiosco en :3001
```

Supabase Studio queda en http://127.0.0.1:54323. Para detener el entorno: `pnpm db:stop`.

## Scripts

| Script            | Qué hace                                                    |
| ----------------- | ----------------------------------------------------------- |
| `pnpm lint`       | ESLint en todos los paquetes                                |
| `pnpm typecheck`  | TypeScript estricto en todos los paquetes                   |
| `pnpm test`       | Vitest (las de `packages/db` necesitan `pnpm db:start`)     |
| `pnpm format`     | Prettier                                                    |
| `pnpm db:migrate` | Aplica las migraciones pendientes a la base local           |
| `pnpm db:reset`   | Recrea la base local desde cero (migraciones y seeds)       |
| `pnpm db:seed`    | Vuelve a aplicar los seeds idempotentes de `supabase/seeds` |

Antes de dar una tarea por terminada: `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde.

## Base de datos

Todo el esquema vive en `supabase/migrations` (SQL numerado; una migración aplicada no se edita) y
se aplica desde cero con `pnpm db:reset`.

- **Un esquema por dominio**: `tenants`, `jornada`, `calculo`, `cumplimiento`, `integraciones` y
  `auditoria`. Llaves UUID v7 (`public.uuid_v7()`).
- **Bitácora inmutable**: `jornada.evento` está particionada por mes y solo acepta `INSERT`. Al
  insertar, la base fija `ts_servidor`, encadena el hash con el evento anterior del trabajador e
  ignora un `client_event_id` repetido. `jornada.verificar_cadena(tenant, trabajador)` dice si la
  cadena está íntegra y dónde se rompe.
- **Sello diario**: un job de pg_cron corre cada hora y sella los días terminados de cada tenant a
  partir de las 02:00 de su hora local (`jornada.sello_diario`, raíz Merkle).
- **Reglas con vigencia**: `calculo.regla` se precarga con el calendario 2026-2030 desde
  `supabase/seeds`; se consulta con `calculo.regla_vigente(clave, fecha)`.
- **RLS**: todas las tablas tienen RLS. Las políticas leen los claims `tenant_id`, `rol`,
  `usuario_id`, `centro_id` y `trabajador_id`, que agrega al JWT el hook
  `tenants.claims_token_acceso` (activado en `supabase/config.toml`).

La forma canónica del hash y del árbol Merkle está documentada en las migraciones y replicada en
`packages/dominio`; las pruebas de `packages/db` comparan ambas implementaciones.

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

- **GitHub**: `IvanSerranoGit/mijornada` (privado). `main` solo recibe cambios por PR.
- **Vercel**: proyecto `mijornada`, raíz `apps/web`, dominios `mijornada.xyz` y `www.mijornada.xyz`.
- **DNS**: zona en Cloudflare definida en `infra/dns/mijornada.xyz.zone`; se aplica con
  `scripts/cloudflare-zona.sh` (requiere `CLOUDFLARE_API_TOKEN` en `.env.local`). SPF, DKIM y DMARC
  están en ese archivo como placeholders comentados.
- **Supabase**: solo entorno local en el sprint 1; el proyecto en la nube se crea al final del sprint 2.
