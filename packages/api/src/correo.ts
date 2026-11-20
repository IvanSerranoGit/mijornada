// Correo transaccional: plantillas en español con la identidad de Mi Jornada, envío con
// Resend y los avisos que salen del cron diario. Detalle en docs/correo.md.
import type { Db } from "./context.ts";
import { fromDatabase } from "./errors.ts";
import { TITULO_INCIDENCIA, type TipoIncidencia } from "./incidencias.ts";

export interface Mensaje {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

/** Envía un mensaje. Devuelve false si no se pudo (el aviso se reintenta en la siguiente corrida). */
export type Enviar = (mensaje: Mensaje) => Promise<boolean>;

const escapar = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Contenido {
  titulo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  /** Texto pequeño al final (por qué recibe el correo, qué hacer si no lo esperaba). */
  nota?: string;
}

/** Arma el HTML y el texto plano de un correo con el formato de Mi Jornada. */
export function plantillaCorreo(contenido: Contenido): { html: string; texto: string } {
  const parrafos = contenido.parrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#111827">${escapar(p)}</p>`,
    )
    .join("");
  const boton = contenido.boton
    ? `<p style="margin:8px 0 24px"><a href="${escapar(contenido.boton.url)}" style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:12px">${escapar(contenido.boton.texto)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6B7280">Si el botón no abre, copia esta dirección en tu navegador:<br>${escapar(contenido.boton.url)}</p>`
    : "";
  const nota = contenido.nota
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#6B7280">${escapar(contenido.nota)}</p>`
    : "";
  const html = `<!doctype html>
<html lang="es-MX">
<body style="margin:0;padding:0;background:#FDFCF9;font-family:Inter,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDFCF9">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E5E7EB;border-radius:20px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#0F766E">mi jornada</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#111827">${escapar(contenido.titulo)}</h1>
${parrafos}${boton}${nota}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#6B7280">Mi Jornada · registro electrónico de jornada laboral · hola@mijornada.xyz</p>
</td></tr>
</table>
</body>
</html>`;
  const texto = [
    contenido.titulo,
    "",
    ...contenido.parrafos,
    ...(contenido.boton ? ["", `${contenido.boton.texto}: ${contenido.boton.url}`] : []),
    ...(contenido.nota ? ["", contenido.nota] : []),
    "",
    "Mi Jornada · hola@mijornada.xyz",
  ].join("\n");
  return { html, texto };
}

const mensaje = (para: string, asunto: string, contenido: Contenido): Mensaje => ({
  para,
  asunto,
  ...plantillaCorreo(contenido),
});

const fechaLarga = (instante: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(
    new Date(instante),
  );

const lista = (nombres: string[]) =>
  nombres.length <= 1
    ? (nombres[0] ?? "")
    : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1) ?? ""}`;

/** Correos del producto. Cada función devuelve el mensaje listo para enviar. */
export const CORREOS = {
  invitacionTrabajador: (para: string, d: { nombre: string; empresa: string; enlace: string }) =>
    mensaje(para, `${d.empresa} te invita a registrar tu jornada`, {
      titulo: `Hola, ${d.nombre}`,
      parrafos: [
        `${d.empresa} usa Mi Jornada para llevar el registro de entradas y salidas que pide la ley.`,
        "Activa tu acceso con tu PIN de 4 dígitos y marca desde tu celular.",
      ],
      boton: { texto: "Activar mi acceso", url: d.enlace },
      nota: "Si no trabajas en esa empresa, ignora este correo.",
    }),

  invitacionUsuario: (para: string, d: { empresa: string; rol: string; enlace: string }) =>
    mensaje(para, `Te invitaron a administrar ${d.empresa} en Mi Jornada`, {
      titulo: `Te invitaron como ${d.rol}`,
      parrafos: [
        `${d.empresa} te dio acceso a su registro de jornada en Mi Jornada.`,
        "Crea tu contraseña para entrar. El enlace vence en 7 días.",
      ],
      boton: { texto: "Crear mi contraseña", url: d.enlace },
      nota: "Si no esperabas esta invitación, ignora este correo.",
    }),

  consentimiento: (para: string, d: { nombre: string; empresa: string }, origin: string) =>
    mensaje(para, "Tienes documentos por aceptar en Mi Jornada", {
      titulo: `Hola, ${d.nombre}`,
      parrafos: [
        `${d.empresa} te compartió el aviso de privacidad y el convenio de registro de jornada, y todavía no los aceptas.`,
        "Leerlos y aceptarlos toma un par de minutos. Mientras tanto puedes seguir marcando.",
      ],
      boton: { texto: "Leer y aceptar", url: `${origin}/app/documentos` },
    }),

  consentimientoEquipo: (para: string, d: { empresa: string; nombres: string[] }, origin: string) =>
    mensaje(para, "Consentimientos pendientes en tu equipo", {
      titulo: "Faltan consentimientos por recabar",
      parrafos: [
        `En ${d.empresa}, ${lista(d.nombres)} ${d.nombres.length === 1 ? "todavía no acepta" : "todavía no aceptan"} el convenio de registro o el aviso de privacidad.`,
        "El registro hace prueba plena cuando fue acordado con cada persona. Puedes recordárselo, o imprimir el convenio para firma autógrafa y subirlo.",
      ],
      boton: { texto: "Ver documentos", url: `${origin}/panel/documentos` },
    }),

  pruebaPorVencer: (para: string, d: { empresa: string; dias_restantes: number }, origin: string) =>
    mensaje(
      para,
      d.dias_restantes <= 1
        ? "Tu prueba de Mi Jornada termina mañana"
        : `Tu prueba de Mi Jornada termina en ${String(d.dias_restantes)} días`,
      {
        titulo:
          d.dias_restantes <= 1
            ? "Tu prueba termina mañana"
            : `Te quedan ${String(d.dias_restantes)} días de prueba`,
        parrafos: [
          `La prueba gratuita de ${d.empresa} está por terminar. Elige un plan para seguir administrando tu registro de jornada.`,
          "Pase lo que pase, tu equipo podrá seguir marcando y tus registros no se borran.",
        ],
        boton: { texto: "Elegir mi plan", url: `${origin}/panel/plan` },
      },
    ),

  pagoFallido: (
    para: string,
    d: { empresa: string; dia: number; gracia_hasta: string },
    origin: string,
  ) =>
    mensaje(
      para,
      d.dia >= 6
        ? "Último aviso: no pudimos cobrar tu plan de Mi Jornada"
        : "No pudimos cobrar tu plan de Mi Jornada",
      {
        titulo: "No pudimos cobrar tu plan",
        parrafos: [
          `El cobro del plan de ${d.empresa} no pasó. Suele ser una tarjeta vencida o sin fondos.`,
          `Actualiza tu forma de pago antes del ${fechaLarga(d.gracia_hasta)}. Después de esa fecha el panel queda en solo lectura; tu equipo podrá seguir marcando y no se borra nada.`,
        ],
        boton: { texto: "Actualizar forma de pago", url: `${origin}/panel/plan` },
      },
    ),

  incidenciasPorResolver: (
    para: string,
    d: { empresa: string; incidencias: { nombre: string; tipo: string }[] },
    origin: string,
  ) =>
    mensaje(
      para,
      d.incidencias.length === 1
        ? "Tienes una incidencia por resolver"
        : `Tienes ${String(d.incidencias.length)} incidencias por resolver`,
      {
        titulo:
          d.incidencias.length === 1
            ? "Una incidencia espera tu respuesta"
            : "Hay incidencias que esperan tu respuesta",
        parrafos: [
          `En ${d.empresa}: ${d.incidencias
            .map(
              (i) => `${i.nombre} (${TITULO_INCIDENCIA[i.tipo as TipoIncidencia].toLowerCase()})`,
            )
            .join("; ")}.`,
          "Revísalas y apruébalas o recházalas; la resolución queda en el registro.",
        ],
        boton: { texto: "Ver incidencias", url: `${origin}/panel/incidencias` },
      },
    ),

  incidenciaPorResponder: (para: string, d: { nombre: string; empresa: string }, origin: string) =>
    mensaje(para, `${d.empresa} registró una corrección en tu jornada`, {
      titulo: `Hola, ${d.nombre}`,
      parrafos: [
        `${d.empresa} abrió una incidencia sobre tu registro de jornada.`,
        "Entra para ver de qué se trata y decir si estás de acuerdo o no. Tu respuesta queda asentada.",
      ],
      boton: { texto: "Ver la incidencia", url: `${origin}/app/incidencias` },
    }),
};

/**
 * Envío con Resend. Sin llave (local, pruebas, o antes de configurar el dominio) no se
 * envía nada y se deja constancia en el registro del servidor.
 */
export function crearEnvio(config: { apiKey: string | undefined; remitente: string }): Enviar {
  return async (m) => {
    if (!config.apiKey) {
      console.info(`[correo] sin RESEND_API_KEY: no se envió "${m.asunto}"`);
      return false;
    }
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.remitente,
        to: [m.para],
        subject: m.asunto,
        html: m.html,
        text: m.texto,
      }),
    });
    if (!respuesta.ok)
      console.error(`[correo] Resend respondió ${String(respuesta.status)} a "${m.asunto}"`);
    return respuesta.ok;
  };
}

interface Aviso {
  tenant_id: string;
  clave: string;
  tipo: string;
  correo: string;
  datos: Record<string, unknown>;
}

const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/**
 * Envía los avisos que tocan hoy (tenants.avisos_pendientes) y los anota como enviados.
 * Corre en el cron diario con rol de servicio. Los avisos al dueño sobre su equipo y sobre
 * incidencias se juntan en un solo correo por empresa.
 */
export async function enviarAvisosPendientes(
  admin: Db,
  enviar: Enviar,
  origin: string,
): Promise<{ enviados: number; fallidos: number }> {
  const { data, error } = await admin.schema("tenants").rpc("avisos_pendientes");
  if (error) throw fromDatabase(error);
  const avisos = data as Aviso[];

  // Un correo por (empresa, destinatario, tipo): junta los avisos que se pueden resumir.
  const grupos = new Map<string, Aviso[]>();
  for (const aviso of avisos) {
    const agrupable =
      aviso.tipo === "consentimiento_equipo" || aviso.tipo === "incidencia_por_resolver";
    const llave = agrupable
      ? `${aviso.tenant_id}|${aviso.correo}|${aviso.tipo}`
      : `${aviso.tenant_id}|${aviso.clave}`;
    grupos.set(llave, [...(grupos.get(llave) ?? []), aviso]);
  }

  let enviados = 0;
  let fallidos = 0;
  for (const grupo of grupos.values()) {
    const primero = grupo[0];
    if (primero === undefined) continue;
    const d = primero.datos;
    const empresa = texto(d["empresa"]);
    let m: Mensaje | null = null;
    switch (primero.tipo) {
      case "consentimiento":
        m = CORREOS.consentimiento(primero.correo, { nombre: texto(d["nombre"]), empresa }, origin);
        break;
      case "consentimiento_equipo":
        m = CORREOS.consentimientoEquipo(
          primero.correo,
          { empresa, nombres: [...new Set(grupo.map((a) => texto(a.datos["nombre"])))] },
          origin,
        );
        break;
      case "prueba_por_vencer":
        m = CORREOS.pruebaPorVencer(
          primero.correo,
          { empresa, dias_restantes: Number(d["dias_restantes"]) },
          origin,
        );
        break;
      case "pago_fallido":
        m = CORREOS.pagoFallido(
          primero.correo,
          { empresa, dia: Number(d["dia"]), gracia_hasta: texto(d["gracia_hasta"]) },
          origin,
        );
        break;
      case "incidencia_por_resolver":
        m = CORREOS.incidenciasPorResolver(
          primero.correo,
          {
            empresa,
            incidencias: grupo.map((a) => ({
              nombre: texto(a.datos["nombre"]),
              tipo: texto(a.datos["tipo"]),
            })),
          },
          origin,
        );
        break;
      case "incidencia_por_responder":
        m = CORREOS.incidenciaPorResponder(
          primero.correo,
          { nombre: texto(d["nombre"]), empresa },
          origin,
        );
        break;
    }
    if (m === null) continue;

    if (await enviar(m)) {
      const { error: anotar } = await admin
        .schema("tenants")
        .from("aviso_enviado")
        .upsert(
          grupo.map((a) => ({ tenant_id: a.tenant_id, clave: a.clave })),
          { ignoreDuplicates: true },
        );
      if (anotar) throw fromDatabase(anotar);
      enviados += 1;
    } else {
      fallidos += 1;
    }
  }
  return { enviados, fallidos };
}

/** Día 0 de un cobro fallido: avisa al dueño en cuanto Stripe lo informa (lo llama el webhook). */
export async function avisarPagoFallido(
  admin: Db,
  enviar: Enviar,
  tenantId: string,
  origin: string,
): Promise<void> {
  const { data: estado } = await admin
    .schema("tenants")
    .rpc("estado_de_cuenta", { p_tenant_id: tenantId });
  const cuenta = estado?.[0];
  if (!cuenta?.pago_fallido_en || !cuenta.gracia_hasta) return;
  const clave = `pago:${cuenta.pago_fallido_en.slice(0, 10)}:0`;
  const { data: yaEnviado } = await admin
    .schema("tenants")
    .from("aviso_enviado")
    .select("clave")
    .eq("tenant_id", tenantId)
    .eq("clave", clave)
    .maybeSingle();
  if (yaEnviado) return;

  const [{ data: empresa }, { data: duenos }] = await Promise.all([
    admin.schema("tenants").from("empresa").select("razon_social").eq("id", tenantId).single(),
    admin
      .schema("tenants")
      .from("usuario")
      .select("auth_user_id")
      .eq("tenant_id", tenantId)
      .eq("rol", "dueno")
      .eq("activo", true),
  ]);
  let enviado = false;
  for (const dueno of duenos ?? []) {
    if (dueno.auth_user_id === null) continue;
    const { data: cuentaAuth } = await admin.auth.admin.getUserById(dueno.auth_user_id);
    const correo = cuentaAuth.user?.email;
    if (!correo) continue;
    enviado =
      (await enviar(
        CORREOS.pagoFallido(
          correo,
          {
            empresa: empresa?.razon_social ?? "tu negocio",
            dia: 0,
            gracia_hasta: cuenta.gracia_hasta,
          },
          origin,
        ),
      )) || enviado;
  }
  if (enviado)
    await admin
      .schema("tenants")
      .from("aviso_enviado")
      .upsert({ tenant_id: tenantId, clave }, { ignoreDuplicates: true });
}
