// Kiosco (código de enlace, token de dispositivo, PIN y QR), invitaciones y geocerca.
import { afterAll, describe, expect, it } from "vitest";
import {
  asRole,
  asUser,
  createTenant,
  expectPgError,
  inRollback,
  sql,
  testId,
  type Tenant,
  type Tx,
} from "./helpers.ts";

afterAll(async () => {
  await sql.end();
});

interface Alta {
  id: string;
  pin: string;
  qr_token: string;
}

/** Da de alta un trabajador como lo hace el dueño: con PIN y QR. */
async function hire(tx: Tx, t: Tenant, centroId: string, nombre: string): Promise<Alta> {
  return asUser(tx, t.dueno, async () => {
    const [row] = await tx<Alta[]>`
      select * from tenants.crear_trabajador(centro_id => ${centroId}, nombre => ${nombre})`;
    if (row === undefined) throw new Error("No se creó el trabajador.");
    return row;
  });
}

/** Genera el código como dueño y lo canjea sin sesión, como lo hace la tablet. */
async function linkKiosk(
  tx: Tx,
  t: Tenant,
  centroId: string,
): Promise<{ codigo: string; token: string }> {
  const codigo = await asUser(tx, t.dueno, async () => {
    const [row] = await tx<
      { codigo: string }[]
    >`select tenants.generar_codigo_enlace(${centroId}) as codigo`;
    return row?.codigo ?? "";
  });
  const token = await asRole(tx, "anon", async () => {
    const [row] = await tx<
      { token: string }[]
    >`select token from tenants.vincular_dispositivo(${codigo.toLowerCase()})`;
    return row?.token ?? "";
  });
  return { codigo, token };
}

interface Marca {
  evento_id: string;
  duplicado: boolean;
  nombre: string;
  tipo: string;
  foto_url: string | null;
}

const kioskMark =
  (
    token: string,
    args: {
      pin?: string;
      qr?: string;
      clientEventId?: string;
      fotoHash?: string;
      atraso?: string;
      fotoEstado?: string;
      fotoMotivo?: string;
    },
  ) =>
  (tx: Tx) => tx<Marca[]>`
    select evento_id, duplicado, nombre, tipo, foto_url
    from jornada.kiosco_marcar(
      p_token => ${token},
      p_client_event_id => ${args.clientEventId ?? testId()},
      p_ts_dispositivo => now() - ${args.atraso ?? "0 seconds"}::interval,
      p_pin => ${args.pin ?? null},
      p_qr => ${args.qr ?? null},
      p_foto_hash => ${args.fotoHash ?? null},
      p_foto_estado => ${args.fotoEstado ?? null},
      p_foto_motivo => ${args.fotoMotivo ?? null})`;

describe("kiosco", () => {
  it("el código de enlace se canjea una sola vez por un token de dispositivo", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const { codigo, token } = await linkKiosk(tx, t, t.centroA);
      expect(codigo).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
      expect(token.length).toBeGreaterThan(40);

      await asRole(tx, "anon", async () => {
        expect(
          await expectPgError(
            tx,
            (sp) => sp`select * from tenants.vincular_dispositivo(${codigo})`,
          ),
        ).toMatch(/ya se usó o venció/);
        const [estado] = await tx`select * from tenants.kiosco_estado(${token})`;
        expect(estado).toMatchObject({ centro: "Centro A", empresa: "Uno", foto: true });
      });

      // En la base no queda ni el código ni el token, solo el hash del token.
      const [row] =
        await tx`select codigo_enlace_hash, token_hash from tenants.dispositivo where tenant_id = ${t.tenantId}`;
      expect(row?.["codigo_enlace_hash"]).toBeNull();
      expect(row?.["token_hash"]).not.toBe(token);
    });
  });

  it("marca por PIN o QR, alterna entrada y salida y no duplica reenvíos", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ana = await hire(tx, t, t.centroA, "Ana Kiosco");
      const { token } = await linkKiosk(tx, t, t.centroA);

      await asRole(tx, "anon", async () => {
        const clientEventId = testId();
        const [entrada] = await kioskMark(token, {
          pin: ana.pin,
          clientEventId,
          atraso: "2 hours",
        })(tx);
        expect(entrada).toMatchObject({
          nombre: "Ana Kiosco",
          tipo: "entrada",
          duplicado: false,
          foto_url: null,
        });

        const [reenvio] = await kioskMark(token, {
          pin: ana.pin,
          clientEventId,
          atraso: "2 hours",
        })(tx);
        expect(reenvio).toMatchObject({
          evento_id: entrada?.evento_id,
          duplicado: true,
          tipo: "entrada",
        });

        const [salida] = await kioskMark(token, { qr: ana.qr_token, fotoHash: "c".repeat(64) })(tx);
        expect(salida).toMatchObject({ tipo: "salida", duplicado: false });
        expect(salida?.foto_url).toMatch(
          new RegExp(`^${t.tenantId}/${ana.id}/\\d{4}-\\d{2}/${salida?.evento_id ?? ""}\\.jpg$`),
        );
      });

      const eventos = await tx`
        select tipo, origen, creado_por, hash_prev is not null as encadenado
        from jornada.evento where trabajador_id = ${ana.id} order by ts_servidor`;
      expect(eventos.map((e) => e["tipo"] as string)).toEqual(["entrada", "salida"]);
      expect(eventos[1]).toMatchObject({ origen: "kiosco", encadenado: true });

      const [dia] =
        await tx`select minutos_trabajados, estado from jornada.dia_laboral where trabajador_id = ${ana.id}`;
      expect(dia).toMatchObject({ estado: "completo" });
      expect(dia?.["minutos_trabajados"]).toBeGreaterThanOrEqual(119);
    });
  });

  it("solo reconoce a los trabajadores de su centro y deja de servir al desvincularlo", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ana = await hire(tx, t, t.centroA, "Ana");
      const caro = await hire(tx, t, t.centroB, "Caro");
      const { token } = await linkKiosk(tx, t, t.centroA);
      const pinAdmin = await asUser(tx, t.dueno, async () => {
        const [row] = await tx<
          { pin: string }[]
        >`select tenants.generar_pin_admin(${t.centroA}) as pin`;
        return row?.pin ?? "";
      });
      expect(pinAdmin).toMatch(/^\d{6}$/);

      await asRole(tx, "anon", async () => {
        const noReconocido = /No reconocemos ese PIN o código/;
        expect(await expectPgError(tx, kioskMark(token, { qr: caro.qr_token }))).toMatch(
          noReconocido,
        );
        expect(await expectPgError(tx, kioskMark(token, { pin: "00000" }))).toMatch(noReconocido);
        expect(await expectPgError(tx, kioskMark("token-inventado", { pin: ana.pin }))).toMatch(
          /no está vinculado/,
        );

        expect(
          await expectPgError(
            tx,
            (sp) => sp`select tenants.desvincular_dispositivo(${token}, '000000')`,
          ),
        ).toMatch(/PIN de administrador no coincide/);
        await tx`select tenants.desvincular_dispositivo(${token}, ${pinAdmin})`;
        expect(await expectPgError(tx, kioskMark(token, { pin: ana.pin }))).toMatch(
          /no está vinculado/,
        );
      });
    });
  });
});

describe("geocerca", () => {
  it("anota si el marcaje quedó fuera de la geocerca, sin bloquearlo", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`update tenants.centro_trabajo set lat = 19.432608, lng = -99.133209, radio_m = 100 where id = ${t.centroA}`;
      const insert = (
        trabajadorId: string,
        lat: number | null,
        lng: number | null,
        precision: number | null,
      ) => tx<{ fuera_de_geocerca: boolean | null }[]>`
        insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, lat, lng, precision_m)
        values (${t.tenantId}, ${trabajadorId}, 'entrada', 'pwa', ${t.dueno.usuario_id}, ${lat}, ${lng}, ${precision})
        returning fuera_de_geocerca`;

      expect((await insert(t.trabajadorA, 19.4327, -99.1333, 10))[0]?.fuera_de_geocerca).toBe(
        false,
      );
      // A unos 1.2 km del centro.
      expect((await insert(t.trabajadorA, 19.4435, -99.1332, 10))[0]?.fuera_de_geocerca).toBe(true);
      // Fuera del radio, pero dentro de la imprecisión del GPS: se da por bueno.
      expect((await insert(t.trabajadorA, 19.4338, -99.1332, 80))[0]?.fuera_de_geocerca).toBe(
        false,
      );
      expect((await insert(t.trabajadorA, null, null, null))[0]?.fuera_de_geocerca).toBeNull();
      // El centro B no tiene geocerca.
      expect((await insert(t.trabajadorB, 19.4435, -99.1332, 10))[0]?.fuera_de_geocerca).toBeNull();
    });
  });
});

describe("invitaciones", () => {
  it("el trabajador activa su acceso con el enlace y su PIN, una sola vez", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ana = await hire(tx, t, t.centroA, "Ana María Pérez");
      const token = await asUser(tx, t.dueno, async () => {
        const [row] = await tx<
          { token: string }[]
        >`select tenants.crear_invitacion(${ana.id}) as token`;
        return row?.token ?? "";
      });

      await asRole(tx, "anon", async () => {
        expect(await tx`select * from tenants.invitacion_info(${token})`).toEqual([
          { nombre: "Ana", empresa: "Uno" },
        ]);
        expect(await tx`select * from tenants.invitacion_info('otro-token')`).toEqual([]);
      });

      const authUserId = testId();
      await tx`insert into auth.users (id, email) values (${authUserId}, 'ana@prueba.test')`;
      const accept = (pin: string) => (sp: Tx) =>
        sp`select tenants.aceptar_invitacion(${token}, ${pin}, ${authUserId})`;

      expect(await expectPgError(tx, accept("0000x"))).toMatch(/El PIN no coincide/);
      await accept(ana.pin)(tx);

      const [usuario] =
        await tx`select rol, trabajador_id from tenants.usuario where auth_user_id = ${authUserId}`;
      expect(usuario).toEqual({ rol: "empleado", trabajador_id: ana.id });
      expect(await expectPgError(tx, accept(ana.pin))).toMatch(/ya se usó o venció/);

      const [ok] = await tx<
        { ok: boolean }[]
      >`select tenants.verificar_pin_de_cuenta(${authUserId}, ${ana.pin}) as ok`;
      expect(ok?.ok).toBe(true);
    });
  });

  it("tras cinco PIN fallidos seguidos se bloquea 15 minutos", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const ana = await hire(tx, t, t.centroA, "Ana");
      const check = (pin: string) => (sp: Tx) =>
        sp<{ ok: boolean }[]>`select tenants.verificar_pin(${ana.id}, ${pin}) as ok`;

      for (let i = 0; i < 5; i += 1) {
        expect((await check("xxxx")(tx))[0]?.ok).toBe(false);
      }
      expect(await expectPgError(tx, check(ana.pin))).toMatch(/Demasiados intentos/);

      await tx`update tenants.intento_pin set bloqueado_hasta = now() - interval '1 minute' where trabajador_id = ${ana.id}`;
      expect((await check(ana.pin)(tx))[0]?.ok).toBe(true);
    });
  });
});

describe("estado de la foto", () => {
  const estados = (tx: Tx, t: Tenant) => tx<{ foto_estado: string; foto_motivo: string | null }[]>`
    select foto_estado, foto_motivo from jornada.evento where tenant_id = ${t.tenantId} order by ts_servidor, id`;

  const pwaMark =
    (t: Tenant, extra: { fotoHash?: string; fotoEstado?: string; fotoMotivo?: string }) =>
    (tx: Tx) => tx`
      insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo, foto_hash, foto_estado, foto_motivo)
      values (${t.tenantId}, ${t.trabajadorA}, 'entrada', 'pwa', ${t.empleadoA.usuario_id}, now(),
              ${extra.fotoHash ?? null}, ${extra.fotoEstado ?? null}, ${extra.fotoMotivo ?? null})`;

  it("lo fija el servidor: con foto es ok; sin foto depende de lo declarado y de si el centro la pide", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      const set = (requerida: boolean) =>
        tx`update tenants.centro_trabajo set foto_en_telefono = ${requerida} where id = ${t.centroA}`;

      await set(false);
      await asUser(tx, t.empleadoA, async () => {
        // El centro no pide foto.
        await pwaMark(t, {})(tx);
        // Decir "ok" sin foto no vale.
        await pwaMark(t, { fotoEstado: "ok" })(tx);
      });
      await set(true);
      await asUser(tx, t.empleadoA, async () => {
        // Con foto siempre es ok, diga lo que diga el dispositivo.
        await pwaMark(t, { fotoHash: "a".repeat(64), fotoEstado: "sin_camara" })(tx);
        // El dispositivo declara qué pasó.
        await pwaMark(t, { fotoEstado: "sin_camara", fotoMotivo: "se ignora" })(tx);
        await pwaMark(t, { fotoEstado: "no_disponible", fotoMotivo: `  ${"x".repeat(200)}` })(tx);
        await pwaMark(t, { fotoEstado: "no_disponible" })(tx);
        // No declara nada y el centro pide foto.
        await pwaMark(t, {})(tx);
      });

      expect(await estados(tx, t)).toEqual([
        { foto_estado: "no_requerida", foto_motivo: null },
        { foto_estado: "no_requerida", foto_motivo: null },
        { foto_estado: "ok", foto_motivo: null },
        { foto_estado: "sin_camara", foto_motivo: null },
        { foto_estado: "no_disponible", foto_motivo: "x".repeat(120) },
        { foto_estado: "no_disponible", foto_motivo: "sin detalle" },
        { foto_estado: "no_disponible", foto_motivo: "el dispositivo no informó el motivo" },
      ]);

      const [cadena] = await tx<{ integra: boolean }[]>`
        select integra from jornada.verificar_cadena(${t.tenantId}, ${t.trabajadorA})`;
      expect(cadena?.integra).toBe(true);
    });
  });

  it("el día laboral cuenta los marcajes sin foto por fallo o falta de cámara", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`update tenants.centro_trabajo set foto_en_telefono = true where id = ${t.centroA}`;
      const dia = async () => {
        const [row] = await tx<{ fotos_no_disponibles: number; estado: string }[]>`
          select fotos_no_disponibles, estado from jornada.dia_laboral
          where tenant_id = ${t.tenantId} and trabajador_id = ${t.trabajadorA}`;
        return row;
      };

      await asUser(tx, t.empleadoA, async () => {
        await pwaMark(t, { fotoHash: "b".repeat(64) })(tx);
      });
      expect(await dia()).toEqual({ fotos_no_disponibles: 0, estado: "incompleto" });

      await asUser(tx, t.empleadoA, async () => {
        await tx`
          insert into jornada.evento (tenant_id, trabajador_id, tipo, origen, creado_por, ts_dispositivo, foto_estado, foto_motivo)
          values (${t.tenantId}, ${t.trabajadorA}, 'salida', 'pwa', ${t.empleadoA.usuario_id}, now(),
                  'no_disponible', 'UnknownError')`;
      });
      expect(await dia()).toEqual({ fotos_no_disponibles: 1, estado: "completo" });
    });
  });

  it("el kiosco sin cámara marca sin_camara y el dispositivo queda señalado hasta que vuelve a mandar foto", async () => {
    await inRollback(async (tx) => {
      const t = await createTenant(tx, "Uno");
      await tx`update tenants.centro_trabajo set foto_en_kiosco = true where id = ${t.centroA}`;
      const ana = await hire(tx, t, t.centroA, "Ana Ruiz");
      const { token } = await linkKiosk(tx, t, t.centroA);
      const camara = async () => {
        const rows = await asUser(
          tx,
          t.dueno,
          () => tx<{ camara_disponible: boolean | null }[]>`
            select camara_disponible from tenants.dispositivo where vinculado_en is not null`,
        );
        return rows[0]?.camara_disponible;
      };
      expect(await camara()).toBeNull();

      await asRole(tx, "anon", async () => {
        await kioskMark(token, { pin: ana.pin, fotoEstado: "sin_camara" })(tx);
      });
      expect(await camara()).toBe(false);
      const [evento] = await tx<{ foto_estado: string; tipo: string }[]>`
        select foto_estado, tipo from jornada.evento where trabajador_id = ${ana.id}`;
      expect(evento).toEqual({ foto_estado: "sin_camara", tipo: "entrada" });

      await asRole(tx, "anon", async () => {
        await kioskMark(token, { pin: ana.pin, fotoHash: "c".repeat(64) })(tx);
      });
      expect(await camara()).toBe(true);
    });
  });
});
