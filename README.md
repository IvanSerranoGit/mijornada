# Mi Jornada

Registro electrónico de jornada laboral para México (LFT art. 132 fr. XXXIV). El contrato del
proyecto y sus principios están en [`CLAUDE.md`](./CLAUDE.md).

## Requisitos

- Node.js 24 (`.nvmrc`) y pnpm 10
- Docker Desktop en ejecución
- Supabase CLI 2.75 o superior

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
| `pnpm test`       | Vitest                                                      |
| `pnpm format`     | Prettier                                                    |
| `pnpm db:migrate` | Aplica las migraciones pendientes a la base local           |
| `pnpm db:reset`   | Recrea la base local desde cero (migraciones y seeds)       |
| `pnpm db:seed`    | Vuelve a aplicar los seeds idempotentes de `supabase/seeds` |

Antes de dar una tarea por terminada: `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde.

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

## Nota sobre `pnpm db:reset`

Con Supabase CLI 2.75, `supabase db reset` termina con un error 502 después de aplicar las
migraciones porque el gateway local conserva la IP anterior de Storage.
`scripts/db-reset.sh` detecta ese caso y reinicia el gateway; los errores reales de migración
se siguen propagando.

## Infraestructura

- **GitHub**: `IvanSerranoGit/mijornada` (privado). `main` solo recibe cambios por PR.
- **Vercel**: proyecto `mijornada`, raíz `apps/web`, dominios `mijornada.xyz` y `www.mijornada.xyz`.
- **DNS**: zona en Cloudflare definida en `infra/dns/mijornada.xyz.zone`; se aplica con
  `scripts/cloudflare-zona.sh` (requiere `CLOUDFLARE_API_TOKEN` en `.env.local`). SPF, DKIM y DMARC
  están en ese archivo como placeholders comentados.
- **Supabase**: solo entorno local en el sprint 1; el proyecto en la nube se crea al final del sprint 2.
