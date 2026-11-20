// Cuerpo HTML del reporte para inspección. Función pura: recibe los datos ya reunidos y
// devuelve el HTML que se convierte a PDF. Todo texto que viene de la base se escapa aquí.
import type { DatosReporte, TipoReporte, TrabajadorReporte } from "./reportes.ts";

const TITULO: Record<TipoReporte, string> = {
  inspeccion: "Reporte de registro de jornada para inspección",
  periodo: "Reporte de registro de jornada del periodo",
  trabajador: "Reporte de registro de jornada por trabajador",
};

const TIPOS_MARCAJE: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_pausa: "Inicio de pausa",
  fin_pausa: "Fin de pausa",
};

const MEDIOS: Record<string, string> = {
  pwa: "Celular",
  kiosco: "Kiosco",
  api: "API",
  import: "Importado",
  incidencia: "Incidencia",
  sincronizacion_tardia: "Sincronización tardía",
};

const ESTADOS_DIA: Record<string, string> = {
  completo: "Original",
  corregido: "Corregido",
  incompleto: "Incompleto",
};

const METODOS: Record<string, string> = {
  firma_simple: "firma electrónica simple",
  clic: "aceptación en kiosco",
  firma_autografa: "firma autógrafa",
};

const INCIDENCIAS: Record<string, string> = {
  olvido: "Olvido de marca",
  correccion_hora: "Corrección de hora",
};

const CONFORMIDAD: Record<string, string> = {
  conforme: "Con conformidad del trabajador",
  inconforme: "Con inconformidad del trabajador",
  sin_respuesta: "Sin conformidad del trabajador",
};

const e = (texto: string | number | null | undefined): string =>
  String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fecha = (dia: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${dia.slice(0, 10)}T00:00:00Z`),
  );

const hora = (instante: string | null, zona: string) =>
  instante === null
    ? "—"
    : new Intl.DateTimeFormat("es-MX", {
        timeZone: zona,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(instante));

const fechaHora = (instante: string, zona: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(instante));

/** Minutos como "8 h 30 min". */
const duracion = (minutos: number) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
};

const tabla = (encabezados: string[], filas: string[][], vacia: string) =>
  filas.length === 0
    ? `<p class="nota">${e(vacia)}</p>`
    : `<table><thead><tr>${encabezados.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${filas
        .map((fila) => `<tr>${fila.map((celda) => `<td>${celda}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;

function seccionTrabajador(t: TrabajadorReporte): string {
  const dias = tabla(
    ["Fecha", "Entrada", "Salida", "Pausas", "Tiempo trabajado", "Medio", "Estado"],
    t.dias.map((d) => [
      e(fecha(d.fecha)),
      e(hora(d.entrada, t.zona)),
      e(hora(d.salida, t.zona)),
      e(d.pausasMin === 0 ? "—" : `${String(d.pausasMin)} min`),
      e(duracion(d.minutosTrabajados)),
      e(d.medios.map((m) => MEDIOS[m] ?? m).join(", ")),
      e(ESTADOS_DIA[d.estado] ?? d.estado),
    ]),
    "Sin registros en el periodo.",
  );

  const corregidas = t.marcajes.filter((m) => m.correccion_evento_id !== null);
  const correcciones =
    corregidas.length === 0
      ? ""
      : `<h3>Correcciones</h3>${tabla(
          [
            "Fecha",
            "Marca",
            "Hora original",
            "Hora declarada",
            "Motivo",
            "Autorizó",
            "Cuándo",
            "Conformidad",
          ],
          corregidas.map((m) => [
            e(fecha(m.fecha)),
            e(
              `${TIPOS_MARCAJE[m.tipo] ?? m.tipo} (${INCIDENCIAS[m.incidencia_tipo ?? ""] ?? "corrección"})`,
            ),
            e(m.hora_original === null ? "No se marcó" : hora(m.hora_original, t.zona)),
            e(hora(m.hora_vigente, t.zona)),
            e(m.correccion_motivo),
            e(m.correccion_autorizo),
            e(
              m.correccion_registrada_en === null
                ? ""
                : fechaHora(m.correccion_registrada_en, t.zona),
            ),
            e(
              `${CONFORMIDAD[m.conformidad ?? "sin_respuesta"] ?? ""}${
                m.comentario_trabajador ? `: “${m.comentario_trabajador}”` : ""
              }${m.extemporanea ? ". Incidencia abierta fuera de plazo." : ""}`,
            ),
          ]),
          "",
        )}`;

  const semanas = tabla(
    [
      "Semana del",
      "Ordinarias",
      "Extra dobles",
      "Extra triples",
      "Jornada máxima semanal",
      "Tope de tiempo extra",
      "Observaciones",
    ],
    t.semanas.map((s) => [
      e(fecha(s.lunes)),
      e(duracion(s.resumen.minutosOrdinarios)),
      e(duracion(s.resumen.minutosExtraDobles)),
      e(duracion(s.resumen.minutosExtraTriples)),
      e(duracion(s.jornadaMaxSemanalMin)),
      e(duracion(s.topeExtraSemanalMin)),
      e(
        s.resumen.alertas.length === 0
          ? "Dentro de los topes"
          : `${String(s.resumen.alertas.length)} ${s.resumen.alertas.length === 1 ? "tope excedido" : "topes excedidos"}`,
      ),
    ]),
    "Sin horas registradas en el periodo.",
  );

  return `<section class="salto">
<h2>${e(t.nombre)}</h2>
<p class="nota">${e([t.puesto, t.centro, t.menorDeEdad ? "menor de 18 años: sin tiempo extraordinario" : null].filter(Boolean).join(" · "))}</p>
<h3>Registro diario</h3>
${dias}
${correcciones}
<h3>Resumen semanal</h3>
${semanas}
</section>`;
}

/** Cuerpo del reporte, en el orden que pide la inspección. */
export function reporteHtml(
  datos: DatosReporte,
  verificacion: { urlVerificacion: string; qrSvg: string },
): string {
  const zona = datos.empresa.zona;
  const integras = datos.trabajadores.filter((t) => t.cadena.integra).length;

  const caratula = `<h1>${e(TITULO[datos.tipo])}</h1>
<table class="datos">
<tr><th>Patrón</th><td>${e(datos.empresa.razonSocial)}</td></tr>
<tr><th>RFC</th><td>${e(datos.empresa.rfc ?? "No registrado")}</td></tr>
<tr><th>Domicilio</th><td>${e(datos.empresa.domicilio ?? "No registrado")}</td></tr>
<tr><th>Centro de trabajo</th><td>${e(datos.centro ?? "Todos los centros")}</td></tr>
<tr><th>Periodo</th><td>${e(fecha(datos.desde))} al ${e(fecha(datos.hasta))}</td></tr>
<tr><th>Personas</th><td>${String(datos.trabajadores.length)}</td></tr>
<tr><th>Eventos registrados</th><td>${String(datos.nEventos)}</td></tr>
<tr><th>Generado</th><td>${e(fechaHora(datos.generadoEn, zona))} (${e(zona)})</td></tr>
<tr><th>Hash raíz del periodo</th><td class="mono">${e(datos.hashRaiz)}</td></tr>
<tr><th>Huella del CSV de eventos</th><td class="mono">${e(datos.hashContenido)}</td></tr>
</table>
<div class="verificacion">
<div class="qr">${verificacion.qrSvg}</div>
<div>
<p><strong>Verificación de integridad</strong></p>
<p>Escanee el código o abra esta dirección para comprobar que los registros de este reporte no han sido alterados desde su generación:</p>
<p class="mono">${e(verificacion.urlVerificacion)}</p>
</div>
</div>
<p class="nota">Registro electrónico de jornada llevado conforme al artículo 132, fracción XXXIV, de la Ley Federal del Trabajo, con el sistema Mi Jornada. Las horas se muestran en la zona horaria de cada centro de trabajo.</p>`;

  const consentimientos = `<section class="salto">
<h2>Estado de consentimientos</h2>
<p class="nota">Aceptación de la versión vigente del convenio de registro y del aviso de privacidad por cada persona.</p>
${tabla(
  ["Persona", "Documento", "Versión", "Estado", "Fecha"],
  datos.trabajadores.flatMap((t) =>
    t.consentimientos.length === 0
      ? [[e(t.nombre), "—", "—", "Sin documentos publicados", "—"]]
      : t.consentimientos.map((c) => [
          e(t.nombre),
          e(c.tipo),
          String(c.version),
          e(
            c.aceptado
              ? `Aceptado (${c.metodos.map((m) => METODOS[m] ?? m).join(", ")})`
              : "Consentimiento pendiente",
          ),
          e(c.aceptadoEn === null ? "—" : fechaHora(c.aceptadoEn, t.zona)),
        ]),
  ),
  "",
)}
</section>`;

  const tardias = datos.trabajadores.flatMap((t) =>
    t.marcajes
      .filter((m) => m.origen === "sincronizacion_tardia")
      .map((m) => [
        e(t.nombre),
        e(TIPOS_MARCAJE[m.tipo] ?? m.tipo),
        e(m.hora_original === null ? "—" : fechaHora(m.hora_original, t.zona)),
        e(fechaHora(m.ts_servidor, t.zona)),
      ]),
  );
  const sinFoto = datos.trabajadores.flatMap((t) =>
    t.marcajes
      .filter((m) => m.foto_estado === "no_disponible" || m.foto_estado === "sin_camara")
      .map((m) => [
        e(t.nombre),
        e(TIPOS_MARCAJE[m.tipo] ?? m.tipo),
        e(fechaHora(m.hora_vigente, t.zona)),
        e(
          m.foto_estado === "sin_camara"
            ? "El dispositivo no tenía cámara"
            : "Fallo técnico al tomar o guardar la foto",
        ),
      ]),
  );
  const notas = `<section class="salto">
<h2>Notas del periodo</h2>
<h3>Marcas con sincronización tardía</h3>
<p class="nota">Marcas hechas sin conexión que llegaron al servidor más de 24 horas después de la hora del dispositivo. La hora que cuenta es la del dispositivo; la de recepción queda registrada.</p>
${tabla(["Persona", "Marca", "Hora del dispositivo", "Recibida en el servidor"], tardias, "No hubo marcas con sincronización tardía en el periodo.")}
<h3>Fotos no disponibles</h3>
<p class="nota">Marcas en que el centro pide foto y no se obtuvo. La marca se registra de todos modos: la foto nunca impide registrar la jornada.</p>
${tabla(["Persona", "Marca", "Hora", "Causa"], sinFoto, "No hubo marcas con foto no disponible en el periodo.")}
</section>`;

  const acta = `<section class="salto">
<h2>Acta de integridad</h2>
<p>Cada registro de jornada guarda una huella criptográfica (SHA-256) encadenada con la del registro anterior de la misma persona, y cada día terminado se sella con la raíz Merkle de sus registros. Un registro no puede modificarse ni eliminarse sin que la cadena deje de verificar. Al generar este reporte se recalculó la cadena de cada persona en el periodo, con este resultado:</p>
<p><strong>${String(integras)} de ${String(datos.trabajadores.length)} cadenas íntegras.</strong></p>
${tabla(
  ["Persona", "Registros verificados", "Resultado"],
  datos.trabajadores.map((t) => [
    e(t.nombre),
    String(t.cadena.nEventos),
    e(t.cadena.integra ? "Íntegra" : `NO ÍNTEGRA: ${t.cadena.motivo ?? "sin detalle"}`),
  ]),
  "",
)}
<h3>Sellos diarios del periodo</h3>
${tabla(
  ["Día", "Registros", "Raíz Merkle del día", "Sellado"],
  datos.sellos.map((s) => [
    e(fecha(s.fecha)),
    String(s.nEventos),
    `<span class="mono">${e(s.hashRaiz)}</span>`,
    e(fechaHora(s.selladoEn, zona)),
  ]),
  "Todavía no hay días sellados en el periodo (un día se sella después de terminar).",
)}
<p class="nota">El archivo de eventos (CSV) que acompaña a este reporte contiene todos los registros del periodo con sus huellas. Su huella SHA-256 es la que aparece en la carátula y al pie de cada página; la página de verificación la muestra también.</p>
</section>`;

  return `<style>
table.datos th { width: 32%; }
.verificacion { display: flex; gap: 16px; align-items: center; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; margin: 12px 0; break-inside: avoid; }
.verificacion .qr { width: 110px; flex: none; }
.verificacion .qr svg { width: 110px; height: 110px; display: block; }
.verificacion p { text-align: left; margin-bottom: 4px; }
</style>
${caratula}
${datos.trabajadores.map(seccionTrabajador).join("\n")}
${consentimientos}
${notas}
${acta}`;
}
