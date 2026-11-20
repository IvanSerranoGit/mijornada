// Invitación de administradores y supervisores por correo.
import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptInvitacionUsuario,
  getInvitacionUsuario,
  sesionFromClaims,
  type UsuarioListado,
} from "../src/index.ts";
import {
  admin,
  correosEnviados,
  createEmpresa,
  createMember,
  newClient,
  unique,
  type Actor,
  type Empresa,
} from "./helpers.ts";

let empresa: Empresa;
let administrador: Actor;

beforeAll(async () => {
  empresa = await createEmpresa();
  administrador = await createMember(empresa, "administrador");
}, 60_000);

interface Invitado {
  id: string;
  rol: string;
  enlace: string;
  correo_enviado: boolean;
}

describe("POST /usuarios", () => {
  it("valida los datos y quién puede invitar a quién", async () => {
    const correo = `sup-${unique()}@prueba.test`;
    const sinCentro = await empresa.dueno.api("POST", "/usuarios", {
      correo,
      nombre: "Sin Centro",
      rol: "supervisor",
    });
    expect(sinCentro.status).toBe(422);
    // Un administrador invita supervisores, pero no a otros administradores.
    const otroAdmin = await administrador.api("POST", "/usuarios", {
      correo,
      nombre: "Otro",
      rol: "administrador",
    });
    expect(otroAdmin.status).toBe(403);
    const dueno = await empresa.dueno.api("POST", "/usuarios", {
      correo,
      nombre: "Dueña",
      rol: "dueno",
    });
    expect(dueno.status).toBe(422);
  });

  it("invita por correo, la persona fija su contraseña con un enlace de un solo uso y entra con su rol", async () => {
    const correo = `Supervisora-${unique()}@Prueba.test`;
    const invitada = await administrador.api<Invitado>("POST", "/usuarios", {
      correo,
      nombre: "Lucía Supervisora",
      rol: "supervisor",
      centro_id: empresa.centroId,
    });
    expect(invitada.status).toBe(201);
    expect(invitada.body).toMatchObject({ rol: "supervisor", correo_enviado: true });
    const token = invitada.body.enlace.split("/").at(-1) ?? "";
    expect(invitada.body.enlace).toBe(`https://mijornada.test/invitacion-usuario/${token}`);

    const mensaje = correosEnviados.find((m) => m.para === correo.toLowerCase());
    expect(mensaje?.asunto).toMatch(/^Te invitaron a administrar Tortillería/);
    expect(mensaje?.texto).toContain(invitada.body.enlace);

    const equipo = await empresa.dueno.api<UsuarioListado[]>("GET", "/equipo");
    expect(equipo.body.find((u) => u.id === invitada.body.id)).toMatchObject({
      nombre: "Lucía Supervisora",
      correo: correo.toLowerCase(),
      invitacion_pendiente: true,
    });

    // El mismo correo no se puede invitar dos veces.
    const repetida = await empresa.dueno.api("POST", "/usuarios", {
      correo,
      nombre: "Lucía",
      rol: "administrador",
    });
    expect(repetida.status).toBe(409);

    expect(await getInvitacionUsuario(admin, "0".repeat(48))).toBeNull();
    expect(await getInvitacionUsuario(admin, token)).toMatchObject({
      rol: "supervisor",
      correo: correo.toLowerCase(),
    });
    await expect(
      acceptInvitacionUsuario(admin, { token, contrasena: "corta" }),
    ).rejects.toBeDefined();

    const contrasena = `clave-${unique()}-larga`;
    expect(await acceptInvitacionUsuario(admin, { token, contrasena })).toEqual({
      correo: correo.toLowerCase(),
    });
    // El enlace ya no sirve.
    await expect(acceptInvitacionUsuario(admin, { token, contrasena })).rejects.toMatchObject({
      status: 404,
    });

    const db = newClient();
    expect(
      (await db.auth.signInWithPassword({ email: correo.toLowerCase(), password: contrasena }))
        .error,
    ).toBeNull();
    const claims = await db.auth.getClaims();
    expect(claims.data ? sesionFromClaims(claims.data.claims) : null).toMatchObject({
      rol: "supervisor",
      tenantId: empresa.tenantId,
      centroId: empresa.centroId,
    });
    const despues = await empresa.dueno.api<UsuarioListado[]>("GET", "/equipo");
    expect(despues.body.find((u) => u.id === invitada.body.id)?.invitacion_pendiente).toBe(false);
  });
});
