// Utilidades para probar contra el Postgres local de `supabase start`.
// Cada prueba corre dentro de una transacción que siempre se revierte, así que no
// deja datos (jornada.evento no admite DELETE).
import postgres from "postgres";
import { resolveDatabaseUrl } from "../src/index.ts";

export type Tx = postgres.TransactionSql;

export const sql = postgres(resolveDatabaseUrl(), { max: 1, onnotice: () => undefined });

class Rollback extends Error {}

/** Ejecuta `fn` en una transacción y la revierte al terminar. */
export async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}

export interface Claims {
  tenant_id: string;
  rol: string;
  usuario_id: string;
  centro_id?: string | null;
  trabajador_id?: string | null;
  /** auth.users.id */
  sub?: string;
}

/** Ejecuta `fn` como un usuario autenticado con esos claims; después vuelve a postgres. */
export async function asUser<T>(tx: Tx, claims: Claims, fn: () => Promise<T>): Promise<T> {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", ...claims })}, true)`;
  await tx`set local role authenticated`;
  try {
    return await fn();
  } finally {
    await tx`reset role`;
    await tx`select set_config('request.jwt.claims', '', true)`;
  }
}

/** Ejecuta `fn` con un rol de Postgres sin claims (anon, service_role). */
export async function asRole<T>(
  tx: Tx,
  role: "anon" | "service_role",
  fn: () => Promise<T>,
): Promise<T> {
  await tx.unsafe(`set local role ${role}`);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

/**
 * Espera que `fn` falle con un error de Postgres. Usa un savepoint para que la
 * transacción de la prueba siga viva después del error.
 */
export async function expectPgError(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
  } catch (error) {
    if (error instanceof postgres.PostgresError) {
      return `${error.code}: ${error.message}`;
    }
    throw error;
  }
  throw new Error("Se esperaba un error de Postgres y la operación tuvo éxito.");
}

let counter = 0;

/** UUID fijo y legible para datos de prueba. */
export function testId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}

export interface Tenant {
  tenantId: string;
  centroA: string;
  centroB: string;
  /** Trabajador del centro A. */
  trabajadorA: string;
  /** Otro trabajador del centro A. */
  trabajadorA2: string;
  /** Trabajador del centro B. */
  trabajadorB: string;
  dueno: Claims;
  administrador: Claims;
  supervisorA: Claims;
  empleadoA: Claims;
  kioscoA: Claims;
  inspector: Claims;
}

/** Crea una empresa con dos centros, tres trabajadores y un usuario por rol. */
export async function createTenant(tx: Tx, nombre: string): Promise<Tenant> {
  const tenantId = testId();
  const [centroA, centroB, trabajadorA, trabajadorA2, trabajadorB] = [
    testId(),
    testId(),
    testId(),
    testId(),
    testId(),
  ];

  await tx`insert into tenants.empresa (id, razon_social, tamano, jurisdiccion)
           values (${tenantId}, ${nombre}, 'micro', 'local')`;
  await tx`insert into tenants.centro_trabajo (id, tenant_id, nombre, zona_horaria) values
           (${centroA}, ${tenantId}, 'Centro A', 'America/Mexico_City'),
           (${centroB}, ${tenantId}, 'Centro B', 'America/Tijuana')`;
  await tx`insert into tenants.trabajador (id, tenant_id, centro_id, nombre) values
           (${trabajadorA}, ${tenantId}, ${centroA}, 'Ana'),
           (${trabajadorA2}, ${tenantId}, ${centroA}, 'Beto'),
           (${trabajadorB}, ${tenantId}, ${centroB}, 'Caro')`;

  const user = async (
    rol: string,
    centroId: string | null,
    trabajadorId: string | null,
  ): Promise<Claims> => {
    const sub = testId();
    const usuarioId = testId();
    await tx`insert into auth.users (id, email) values (${sub}, ${`${sub}@prueba.test`})`;
    await tx`insert into tenants.usuario (id, tenant_id, auth_user_id, rol, centro_id, trabajador_id)
             values (${usuarioId}, ${tenantId}, ${sub}, ${rol}, ${centroId}, ${trabajadorId})`;
    return {
      tenant_id: tenantId,
      rol,
      usuario_id: usuarioId,
      centro_id: centroId,
      trabajador_id: trabajadorId,
      sub,
    };
  };

  return {
    tenantId,
    centroA,
    centroB,
    trabajadorA,
    trabajadorA2,
    trabajadorB,
    dueno: await user("dueno", null, null),
    administrador: await user("administrador", null, null),
    supervisorA: await user("supervisor", centroA, null),
    empleadoA: await user("empleado", null, trabajadorA),
    kioscoA: await user("kiosco", centroA, null),
    inspector: await user("inspector", null, null),
  };
}

/** Inserta un evento como postgres (sin RLS) y devuelve su id. */
export async function insertEvent(
  tx: Tx,
  tenant: Tenant,
  trabajadorId: string,
  tipo = "entrada",
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por)
    values (${tenant.tenantId}, ${trabajadorId}, ${tipo}, 'api', ${tenant.dueno.usuario_id})
    returning id`;
  if (row === undefined) {
    throw new Error("El evento no se insertó.");
  }
  return row.id;
}
