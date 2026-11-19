import { bytesToHex, sha256, uuidV7 } from "@mijornada/dominio";
import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptInvitacion,
  createInvitacion,
  handleKioscoRequest,
  loginConPin,
  sesionFromClaims,
  type ResultadoEvento,
} from "../src/index.ts";
import {
  admin,
  callApi,
  createEmpresa,
  newClient,
  publico,
  unique,
  type Empresa,
} from "./helpers.ts";

let empresa: Empresa;

beforeAll(async () => {
  empresa = await createEmpresa();
}, 60_000);

async function kiosco<T = Record<string, unknown>>(
  method: string,
  ruta: string,
  options: { token?: string; body?: unknown; bytes?: Uint8Array<ArrayBuffer> } = {},
): Promise<{ status: number; body: T }> {
  const request = new Request(`http://kiosco.test/api/v1/kiosco${ruta}`, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body
      ? { body: JSON.stringify(options.body) }
      : options.bytes
        ? { body: options.bytes }
        : {}),
  });
  const response = await handleKioscoRequest(request, ruta.split("/").filter(Boolean), {
    publico,
    admin: () => admin,
  });
  return { status: response.status, body: (await response.json()) as T };
}

describe("kiosco", () => {
  it("vincula la tablet, marca con PIN, sube la foto y se desvincula con el PIN de administrador", async () => {
    const enlace = await empresa.dueno.api<{ codigo: string }>(
      "POST",
      `/centros/${empresa.centroId}/codigo-enlace`,
    );
    const vinculo = await kiosco<{ token: string; centro: string; foto: boolean }>(
      "POST",
      "/vincular",
      {
        body: { codigo: enlace.body.codigo.toLowerCase() },
      },
    );
    expect(vinculo.status).toBe(201);
    expect(vinculo.body).toMatchObject({ centro: "Matriz", foto: true });
    const token = vinculo.body.token;

    expect(
      (await kiosco("POST", "/vincular", { body: { codigo: enlace.body.codigo } })).status,
    ).toBe(404);
    expect((await kiosco("GET", "/estado")).status).toBe(401);
    expect((await kiosco("GET", "/estado", { token })).body).toMatchObject({ centro: "Matriz" });

    const foto = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    const marca = await kiosco<{
      evento_id: string;
      nombre: string;
      tipo: string;
      foto_url: string;
    }>("POST", "/marcar", {
      token,
      body: {
        client_event_id: uuidV7(),
        ts_dispositivo: new Date().toISOString(),
        pin: empresa.pin,
        foto_hash: bytesToHex(await sha256(foto)),
      },
    });
    expect(marca.status).toBe(200);
    expect(marca.body).toMatchObject({ nombre: "Mariana López", tipo: "entrada" });

    const otraFoto = await kiosco("PUT", `/foto/${marca.body.evento_id}`, {
      token,
      bytes: new Uint8Array([9, 9, 9]),
    });
    expect(otraFoto.status).toBe(422);
    const subida = await kiosco<{ ruta: string }>("PUT", `/foto/${marca.body.evento_id}`, {
      token,
      bytes: foto,
    });
    expect(subida.status).toBe(201);
    expect(subida.body.ruta).toBe(marca.body.foto_url);
    const { data: guardada } = await admin.storage.from("marcajes").download(subida.body.ruta);
    expect(guardada?.size).toBe(foto.length);

    const malPin = await kiosco<{ codigo: string }>("POST", "/marcar", {
      token,
      body: { client_event_id: uuidV7(), ts_dispositivo: new Date().toISOString(), pin: "0000" },
    });
    expect([404, 200]).toContain(malPin.status);

    const { data: pinAdmin } = await empresa.dueno.db
      .schema("tenants")
      .rpc("generar_pin_admin", { centro_id: empresa.centroId });
    expect(
      (await kiosco("POST", "/desvincular", { token, body: { pin_admin: "000000" } })).status,
    ).toBe(403);
    expect(
      (await kiosco("POST", "/desvincular", { token, body: { pin_admin: pinAdmin } })).status,
    ).toBe(200);
    expect((await kiosco("GET", "/estado", { token })).status).toBe(403);
  }, 30_000);
});

describe("acceso del trabajador", () => {
  it("activa su acceso con la invitación y su PIN, y después entra con correo + PIN", async () => {
    const correo = `trabajador-${unique()}@prueba.test`;
    const { token } = await createInvitacion(await empresa.dueno.ctx(), empresa.trabajadorId);

    await expect(
      acceptInvitacion(admin, { token, correo, pin: "0000" === empresa.pin ? "1111" : "0000" }),
    ).rejects.toMatchObject({
      codigo: "pin_incorrecto",
    });

    const concedido = await acceptInvitacion(admin, { token, correo, pin: empresa.pin });
    const db = newClient();
    const sesion = await db.auth.verifyOtp({ token_hash: concedido.tokenHash, type: "email" });
    expect(sesion.error).toBeNull();
    const claims = await db.auth.getClaims();
    const actor = claims.data ? sesionFromClaims(claims.data.claims) : null;
    expect(actor).toMatchObject({
      rol: "empleado",
      tenantId: empresa.tenantId,
      trabajadorId: empresa.trabajadorId,
    });
    if (actor === null) throw new Error("sin sesión");

    const marcado = await callApi<{ resultados: ResultadoEvento[] }>(
      "POST",
      "/eventos",
      {
        trabajador_id: empresa.trabajadorId,
        client_event_id: uuidV7(),
        tipo: "salida",
        origen: "pwa",
        ts_dispositivo: new Date().toISOString(),
      },
      () => Promise.resolve({ db, sesion: actor }),
    );
    expect(marcado.body.resultados[0]?.estado).toBe("insertado");

    await expect(
      acceptInvitacion(admin, { token, correo: `otro-${unique()}@prueba.test`, pin: empresa.pin }),
    ).rejects.toMatchObject({
      codigo: "invitacion_invalida",
    });

    await expect(
      loginConPin(admin, { correo, pin: empresa.pin === "9999" ? "8888" : "9999" }),
    ).rejects.toMatchObject({
      codigo: "acceso_invalido",
    });
    await expect(
      loginConPin(admin, { correo: `nadie-${unique()}@prueba.test`, pin: empresa.pin }),
    ).rejects.toMatchObject({
      codigo: "acceso_invalido",
    });
    // Un intento con un correo desconocido no deja cuentas vacías en Auth.
    const { data: cuentas } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(cuentas.users.filter((u) => u.email?.startsWith("nadie-"))).toEqual([]);

    const entrada = await loginConPin(admin, { correo, pin: empresa.pin });
    const otro = newClient();
    expect(
      (await otro.auth.verifyOtp({ token_hash: entrada.tokenHash, type: "email" })).error,
    ).toBeNull();
  }, 30_000);
});
