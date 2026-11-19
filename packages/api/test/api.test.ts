import { uuidV7 } from "@mijornada/dominio";
import { beforeAll, describe, expect, it } from "vitest";
import { buildOpenApi, type Pagina, type ResultadoEvento } from "../src/index.ts";
import {
  admin,
  callApi,
  createActor,
  createEmpresa,
  createMember,
  type Actor,
  type Empresa,
} from "./helpers.ts";

interface ErrorBody {
  codigo: string;
  mensaje: string;
}

let uno: Empresa;
let dos: Empresa;
let empleado: Actor;
let inspector: Actor;

beforeAll(async () => {
  [uno, dos] = await Promise.all([createEmpresa(), createEmpresa()]);
  [empleado, inspector] = await Promise.all([
    createMember(uno, "empleado"),
    createMember(uno, "inspector"),
  ]);
}, 60_000);

const marcaje = (trabajadorId: string, tipo = "entrada", extra: Record<string, unknown> = {}) => ({
  trabajador_id: trabajadorId,
  client_event_id: uuidV7(),
  tipo,
  origen: "pwa",
  ts_dispositivo: new Date().toISOString(),
  ...extra,
});

describe("sesión y errores", () => {
  it("sin sesión responde 401 con codigo y mensaje en español", async () => {
    const r = await callApi<ErrorBody>("GET", "/centros", undefined, () => Promise.resolve(null));
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ codigo: "no_autenticado", mensaje: "Inicia sesión para continuar." });
  });

  it("ruta o método desconocidos y datos inválidos", async () => {
    expect((await uno.dueno.api("GET", "/nada")).status).toBe(404);
    expect((await uno.dueno.api("POST", "/reglas", {})).status).toBe(405);

    const r = await uno.dueno.api<ErrorBody>("POST", "/centros", { nombre: "" });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe("datos_invalidos");
    expect(r.body.mensaje).toMatch(/nombre/);
  });

  it("una cuenta sin empresa no puede crear centros, y solo puede tener una empresa", async () => {
    const nuevo = await createActor();
    const r = await nuevo.api<ErrorBody>("POST", "/centros", { nombre: "Matriz" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("sin_empresa");

    const repetida = await uno.dueno.api<ErrorBody>("POST", "/empresas", {
      razon_social: "Otra",
      tamano: "micro",
      jurisdiccion: "local",
    });
    expect(repetida.status).toBe(409);
    expect(repetida.body.mensaje).toBe("Tu cuenta ya pertenece a una empresa.");
  });
});

describe("dueño", () => {
  it("ve y edita su empresa, y no ve la de otro tenant", async () => {
    const lista = await uno.dueno.api<{ id: string; plan: string }[]>("GET", "/empresas");
    expect(lista.body.map((e) => e.id)).toEqual([uno.tenantId]);
    expect(lista.body[0]?.plan).toBe("prueba");

    const editada = await uno.dueno.api<{ sector: string }>("PATCH", `/empresas/${uno.tenantId}`, {
      sector: "Tortillerías",
    });
    expect(editada.status).toBe(200);
    expect(editada.body.sector).toBe("Tortillerías");

    expect((await uno.dueno.api("GET", `/empresas/${dos.tenantId}`)).status).toBe(404);
    expect(
      (await uno.dueno.api("PATCH", `/empresas/${dos.tenantId}`, { sector: "X" })).status,
    ).toBe(404);
  });

  it("da de alta trabajadores con PIN de 4 dígitos y QR, sin exponer sus hashes", async () => {
    const creado = await uno.dueno.api<{ id: string; pin: string; qr_token: string }>(
      "POST",
      "/trabajadores",
      {
        centro_id: uno.centroId,
        nombre: "Beto Ruiz",
        curp: "RUBB900101HDFXXX09",
        nss: "12345678901",
      },
    );
    expect(creado.status).toBe(201);
    expect(creado.body.pin).toMatch(/^\d{4}$/);
    expect(creado.body.qr_token.length).toBeGreaterThanOrEqual(32);

    const lista = await uno.dueno.api<Pagina<Record<string, unknown>>>(
      "GET",
      "/trabajadores?limite=1",
    );
    expect(lista.body.datos).toHaveLength(1);
    expect(lista.body.siguiente).not.toBeNull();
    expect(Object.keys(lista.body.datos[0] ?? {})).not.toContain("pin_hash");

    const resto = await uno.dueno.api<Pagina<{ id: string }>>(
      "GET",
      `/trabajadores?cursor=${lista.body.siguiente ?? ""}`,
    );
    expect(resto.body.datos.map((t) => t.id)).toContain(creado.body.id);

    // CURP y NSS quedaron cifrados; el PIN, con bcrypt.
    const { data } = await admin
      .schema("tenants")
      .from("trabajador")
      .select("curp_cifrado, nss_cifrado, pin_hash")
      .eq("id", creado.body.id)
      .single();
    expect(data?.curp_cifrado).not.toContain("RUBB");
    expect(data?.pin_hash).toMatch(/^\$2a\$06\$/);

    const ajeno = await uno.dueno.api<ErrorBody>("POST", "/trabajadores", {
      centro_id: dos.centroId,
      nombre: "Intruso",
    });
    expect(ajeno.status).toBe(403);
  });

  it("un horario nuevo cierra el anterior en vez de sobreescribirlo", async () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const creado = await uno.dueno.api("POST", "/horarios", {
      trabajador_id: uno.trabajadorId,
      vigente_desde: manana,
      dias: [1, 2, 3, 4, 5, 6],
      hora_entrada: "08:00",
      hora_salida: "16:00",
    });
    expect(creado.status).toBe(201);

    const historial = await uno.dueno.api<
      { vigente_desde: string; vigente_hasta: string | null; hora_entrada: string }[]
    >("GET", `/horarios?trabajador_id=${uno.trabajadorId}`);
    expect(historial.body).toHaveLength(2);
    expect(historial.body[0]).toMatchObject({
      vigente_desde: manana,
      vigente_hasta: null,
      hora_entrada: "08:00:00",
    });
    expect(historial.body[1]?.vigente_hasta).toBe(hoy);
  });

  it("configura el método de marcaje y genera un código de enlace de 8 caracteres", async () => {
    const centro = await uno.dueno.api<{ metodo_marcaje: string }>(
      "PATCH",
      `/centros/${uno.centroId}`,
      {
        metodo_marcaje: "ambos",
      },
    );
    expect(centro.body.metodo_marcaje).toBe("ambos");

    const enlace = await uno.dueno.api<{ codigo: string }>(
      "POST",
      `/centros/${uno.centroId}/codigo-enlace`,
    );
    expect(enlace.status).toBe(201);
    expect(enlace.body.codigo).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  });

  it("consulta las reglas vigentes por fecha", async () => {
    const r = await uno.dueno.api<{ clave: string; valor: number }[]>(
      "GET",
      "/reglas?fecha=2027-06-01",
    );
    expect(r.body.find((regla) => regla.clave === "jornada_max_semanal")?.valor).toBe(46);
    expect(r.body.find((regla) => regla.clave === "tope_extra_semanal")?.valor).toBe(9);
  });
});

describe("empleado", () => {
  it("POST /eventos es idempotente por client_event_id, uno por uno y en lote", async () => {
    const entrada = marcaje(uno.trabajadorId, "entrada", {
      lat: 19.4326,
      lng: -99.1332,
      precision_m: 12,
    });
    const primero = await empleado.api<{ resultados: ResultadoEvento[] }>(
      "POST",
      "/eventos",
      entrada,
    );
    expect(primero.status).toBe(200);
    expect(primero.body.resultados).toMatchObject([
      { client_event_id: entrada.client_event_id, estado: "insertado" },
    ]);
    const eventoId = primero.body.resultados[0]?.evento?.id;

    // El mismo evento reenviado (por ejemplo, al recuperar la red) no se duplica.
    const salida = marcaje(uno.trabajadorId, "salida");
    const lote = await empleado.api<{ resultados: ResultadoEvento[] }>("POST", "/eventos", [
      entrada,
      salida,
      salida,
    ]);
    expect(lote.body.resultados.map((r) => r.estado)).toEqual([
      "existente",
      "insertado",
      "existente",
    ]);
    expect(lote.body.resultados[0]?.evento?.id).toBe(eventoId);

    const eventos = await empleado.api<
      Pagina<{ tipo: string; hash: string; hash_prev: string | null }>
    >("GET", `/eventos?trabajador_id=${uno.trabajadorId}`);
    expect(eventos.body.datos.map((e) => e.tipo)).toEqual(["entrada", "salida"]);
    expect(eventos.body.datos[1]?.hash_prev).toBe(eventos.body.datos[0]?.hash);

    const { data: cadena } = await admin
      .schema("jornada")
      .rpc("verificar_cadena", { p_tenant_id: uno.tenantId, p_trabajador_id: uno.trabajadorId });
    expect(cadena?.[0]).toMatchObject({ integra: true, n_eventos: 2 });
  });

  it("un marcaje que llega más de 24 h tarde queda como sincronización tardía", async () => {
    const tardio = marcaje(uno.trabajadorId, "entrada", {
      ts_dispositivo: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    });
    const r = await empleado.api<{ resultados: ResultadoEvento[] }>("POST", "/eventos", tardio);
    expect(r.body.resultados[0]?.evento?.origen).toBe("sincronizacion_tardia");
  });

  it("solo marca por sí mismo y no administra nada", async () => {
    const { data: otro } = await admin
      .schema("tenants")
      .from("trabajador")
      .select("id")
      .eq("tenant_id", uno.tenantId)
      .neq("id", uno.trabajadorId)
      .limit(1)
      .single();

    const r = await empleado.api<{ resultados: ResultadoEvento[] }>("POST", "/eventos", [
      marcaje(otro?.id ?? ""),
      marcaje(dos.trabajadorId),
      marcaje(uno.trabajadorId, "entrada", { origen: "kiosco" }),
    ]);
    expect(r.body.resultados.map((x) => x.estado)).toEqual(["rechazado", "rechazado", "rechazado"]);
    expect(r.body.resultados[0]?.error?.codigo).toBe("sin_permiso");

    expect((await empleado.api("POST", "/centros", { nombre: "Mío" })).status).toBe(403);
    expect(
      (await empleado.api("POST", "/trabajadores", { centro_id: uno.centroId, nombre: "X" }))
        .status,
    ).toBe(403);
    const visibles = await empleado.api<Pagina<{ id: string }>>("GET", "/trabajadores");
    expect(visibles.body.datos.map((t) => t.id)).toEqual([uno.trabajadorId]);
  });
});

describe("inspector y otros tenants", () => {
  it("el inspector no ve trabajadores ni eventos ni puede marcar", async () => {
    expect((await inspector.api<Pagina<unknown>>("GET", "/trabajadores")).body.datos).toEqual([]);
    expect(
      (await inspector.api<Pagina<unknown>>("GET", `/eventos?trabajador_id=${uno.trabajadorId}`))
        .body.datos,
    ).toEqual([]);
    expect((await inspector.api<unknown[]>("GET", "/centros")).body).toEqual([]);
    const r = await inspector.api<{ resultados: ResultadoEvento[] }>(
      "POST",
      "/eventos",
      marcaje(uno.trabajadorId),
    );
    expect(r.body.resultados[0]?.estado).toBe("rechazado");
  });

  it("el dueño de otro tenant no ve ni toca nada de este", async () => {
    expect(
      (await dos.dueno.api<Pagina<unknown>>("GET", `/eventos?trabajador_id=${uno.trabajadorId}`))
        .body.datos,
    ).toEqual([]);
    expect(
      (await dos.dueno.api("PATCH", `/centros/${uno.centroId}`, { nombre: "Tomado" })).status,
    ).toBe(404);
    expect(
      (await dos.dueno.api("PATCH", `/trabajadores/${uno.trabajadorId}`, { nombre: "Tomado" }))
        .status,
    ).toBe(404);
    const r = await dos.dueno.api<ErrorBody>("POST", `/centros/${uno.centroId}/codigo-enlace`);
    expect(r.status).toBe(403);
  });
});

describe("límite de peticiones y OpenAPI", () => {
  it("responde 429 al rebasar el límite por tenant", async () => {
    const empresa = await createEmpresa();
    const ctx = () => empresa.dueno.ctx();
    const call = async () => {
      const url = new URL("http://prueba.test/api/v1/centros");
      const { handleRequest } = await import("../src/index.ts");
      return handleRequest(new Request(url), ["centros"], { getCtx: ctx, limitePorMinuto: 3 });
    };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call()).status);
    expect(statuses).toContain(429);
    expect(statuses[0]).toBe(200);
  }, 30_000);

  it("el documento OpenAPI describe todas las rutas", () => {
    const doc = buildOpenApi() as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/empresas",
        "/centros",
        "/trabajadores",
        "/horarios",
        "/eventos",
        "/dias",
        "/reglas",
      ]),
    );
    expect(doc.paths["/eventos"]).toHaveProperty("post.requestBody");
    expect(JSON.stringify(doc)).not.toContain("undefined");
  });
});
