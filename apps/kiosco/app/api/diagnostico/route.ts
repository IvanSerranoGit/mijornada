// Recibe avisos de error de los dispositivos (PWA y kiosco) y los deja en los
// registros del servidor para poder diagnosticarlos. No guarda nada ni lleva datos
// personales: solo dónde falló, el mensaje del error y el navegador.
export async function POST(request: Request): Promise<Response> {
  const texto = (await request.text()).slice(0, 2000);
  let aviso: { donde?: unknown; detalle?: unknown } = {};
  try {
    aviso = JSON.parse(texto) as typeof aviso;
  } catch {
    return new Response(null, { status: 400 });
  }
  console.error(
    "[dispositivo]",
    typeof aviso.donde === "string" ? aviso.donde.slice(0, 60) : "?",
    "·",
    typeof aviso.detalle === "string" ? aviso.detalle.slice(0, 500) : "?",
    "·",
    (request.headers.get("user-agent") ?? "").slice(0, 160),
  );
  return new Response(null, { status: 204 });
}
