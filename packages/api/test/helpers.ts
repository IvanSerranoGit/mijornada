// Pruebas de la API contra el Supabase local: sesiones reales de Supabase Auth,
// así que pasan por el hook de claims, PostgREST y RLS igual que en producción.
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Database } from "@mijornada/db/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleRequest, sesionFromClaims, type Ctx, type Servicios } from "../src/index.ts";

interface Status {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    cwd: path.resolve(import.meta.dirname, "../../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
) as Status;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente con rol de servicio: solo para preparar datos de prueba. */
export const admin: SupabaseClient<Database> = createClient<Database>(
  status.API_URL,
  status.SERVICE_ROLE_KEY,
  options,
);

/** Cliente sin sesión (llave pública), como el que usa el kiosco. */
export const publico: SupabaseClient<Database> = createClient<Database>(
  status.API_URL,
  status.ANON_KEY,
  options,
);

/** Cliente nuevo sin sesión, para abrir en él la sesión de un trabajador. */
export const newClient = (): SupabaseClient<Database> =>
  createClient<Database>(status.API_URL, status.ANON_KEY, options);

let counter = 0;
export const unique = () =>
  `${Date.now().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface Actor {
  authUserId: string;
  email: string;
  password: string;
  db: SupabaseClient<Database>;
  /** Vuelve a iniciar sesión para recibir claims nuevos. */
  refresh: () => Promise<void>;
  ctx: () => Promise<Ctx>;
  /** Llama a /api/v1 como este usuario. */
  api: <T = unknown>(
    method: string,
    ruta: string,
    body?: unknown,
  ) => Promise<{ status: number; body: T }>;
}

/** Crea una cuenta en Supabase Auth e inicia sesión. */
export async function createActor(): Promise<Actor> {
  const email = `prueba-${unique()}@prueba.test`;
  const password = `pw-${unique()}-${unique()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const db = createClient<Database>(status.API_URL, status.ANON_KEY, options);
  const signIn = async () => {
    const result = await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
  };
  await signIn();

  const ctx = async (): Promise<Ctx> => {
    const claims = await db.auth.getClaims();
    const sesion = claims.data ? sesionFromClaims(claims.data.claims) : null;
    if (sesion === null) throw new Error("La sesión de prueba no tiene claims.");
    return { db, sesion };
  };

  return {
    authUserId: data.user.id,
    email,
    password,
    db,
    refresh: signIn,
    ctx,
    api: (method, ruta, body) => callApi(method, ruta, body, ctx),
  };
}

/**
 * Servicios de prueba: el "PDF" son los bytes del HTML (para poder leerlo) y el QR un SVG
 * mínimo. El navegador real se prueba en e2e.
 */
export const servicios: Servicios = {
  pdf: (pagina) =>
    Promise.resolve(new TextEncoder().encode(`%PDF-prueba\n${pagina.cuerpoHtml}\n${pagina.pie}`)),
  qr: (texto) => Promise.resolve(`<svg data-qr="${texto}"></svg>`),
  admin: () => admin,
};

export async function callApi<T = unknown>(
  method: string,
  ruta: string,
  body: unknown,
  getCtx: () => Promise<Ctx | null>,
): Promise<{ status: number; body: T }> {
  const url = new URL(`http://prueba.test/api/v1${ruta}`);
  const request = new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const response = await handleRequest(
    request,
    url.pathname.replace("/api/v1", "").split("/").filter(Boolean),
    { getCtx, origin: "https://mijornada.test", servicios },
  );
  return { status: response.status, body: (await response.json()) as T };
}

export interface Empresa {
  dueno: Actor;
  tenantId: string;
  centroId: string;
  trabajadorId: string;
  pin: string;
}

/** Empresa completa creada por la API: dueño, un centro y un trabajador con horario. */
export async function createEmpresa(): Promise<Empresa> {
  const dueno = await createActor();
  const empresa = await dueno.api<{ id: string }>("POST", "/empresas", {
    razon_social: `Tortillería ${unique()}`,
    tamano: "micro",
    sector: "Alimentos",
    jurisdiccion: "local",
  });
  if (empresa.status !== 201) throw new Error(JSON.stringify(empresa.body));
  await dueno.refresh();

  const centro = await dueno.api<{ id: string }>("POST", "/centros", { nombre: "Matriz" });
  if (centro.status !== 201) throw new Error(JSON.stringify(centro.body));

  const trabajador = await dueno.api<{ id: string; pin: string }>("POST", "/trabajadores", {
    centro_id: centro.body.id,
    nombre: "Mariana López",
    puesto: "Cajera",
    horario: {
      dias: [1, 2, 3, 4, 5],
      hora_entrada: "09:00",
      hora_salida: "18:00",
      descanso_semanal: [7],
    },
  });
  if (trabajador.status !== 201) throw new Error(JSON.stringify(trabajador.body));

  return {
    dueno,
    tenantId: empresa.body.id,
    centroId: centro.body.id,
    trabajadorId: trabajador.body.id,
    pin: trabajador.body.pin,
  };
}

/** Cuenta con un rol dentro de una empresa (lo que después harán las invitaciones). */
export async function createMember(
  empresa: Empresa,
  rol: "empleado" | "supervisor" | "inspector" | "administrador",
): Promise<Actor> {
  const actor = await createActor();
  const { error } = await admin
    .schema("tenants")
    .from("usuario")
    .insert({
      tenant_id: empresa.tenantId,
      auth_user_id: actor.authUserId,
      rol,
      centro_id: rol === "supervisor" ? empresa.centroId : null,
      trabajador_id: rol === "empleado" ? empresa.trabajadorId : null,
    });
  if (error) throw error;
  await actor.refresh();
  return actor;
}
