import { DIAS_DE_PRUEBA, PLANES, PLANES_PAGADOS } from "@mijornada/api";
import { Logo } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";

// Página de inicio pública. Es estática: no lee sesión ni base, para que cargue rápido en
// un celular con mala señal. El registro y el panel viven en /registro y /panel.
export const dynamic = "force-static";

const TITULO =
  "Cumple con el registro de jornada que pide la STPS en 10 minutos, desde el celular, sin comprar aparatos";
const DESCRIPCION =
  "Mi Jornada es el registro electrónico de entradas y salidas que exige la Ley Federal del Trabajo desde el 1 de enero de 2027. Para negocios de 1 a 60 personas, sin área de recursos humanos.";

export const metadata: Metadata = {
  title: "Mi Jornada · Registro electrónico de jornada laboral",
  description: DESCRIPCION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Mi Jornada · Registro electrónico de jornada laboral",
    description: DESCRIPCION,
    url: "/",
    siteName: "Mi Jornada",
    locale: "es_MX",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Mi Jornada", description: DESCRIPCION },
};

const pesos = (monto: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(monto);

const boton =
  "inline-flex items-center justify-center rounded-(--radio-md) px-(--espacio-lg) py-[14px] text-cuerpo font-medium";
const primario = `${boton} bg-bg-brand text-text-on-brand hover:bg-bg-brand-hover`;
const secundario = `${boton} border-[1.5px] border-border-brand bg-bg-surface text-text-brand hover:bg-bg-brand-soft`;

const PASOS = [
  {
    titulo: "Da de alta tu negocio",
    texto:
      "Tu empresa, tu centro de trabajo y tu equipo. Cada persona recibe su PIN y su código QR.",
  },
  {
    titulo: "Tu equipo marca",
    texto:
      "Desde su propio celular o en una tablet del negocio que funciona como kiosco. También sin internet: la marca se guarda y se envía sola.",
  },
  {
    titulo: "Tú tienes el registro",
    texto:
      "Horas trabajadas y tiempo extra por semana, y un reporte listo para entregar si llega una inspección.",
  },
];

const PREGUNTAS = [
  {
    pregunta: "¿Qué pasa si no hay internet?",
    respuesta:
      "La marca se guarda en el celular o en la tablet con la hora en que se hizo y se envía sola cuando vuelve la conexión. En el registro queda anotado que llegó después.",
  },
  {
    pregunta: "No tengo área de recursos humanos. ¿Es complicado?",
    respuesta:
      "No. El alta toma unos 10 minutos y no necesitas instalar nada ni comprar un reloj checador. Si alguien olvida marcar, lo reporta desde su celular y tú lo apruebas.",
  },
  {
    pregunta: "¿Qué entrego si llega una inspección?",
    respuesta:
      "Un reporte en PDF con el registro diario de cada persona, las correcciones con su motivo y quién las autorizó, las horas extra contra los topes de la ley y un acta de integridad. El inspector puede verificar con un código QR que nada fue alterado.",
  },
  {
    pregunta: "¿Qué datos de mi equipo se guardan?",
    respuesta:
      "Nombre, puesto, horario y la hora de cada entrada y salida. Si tú lo activas, la ubicación solo en el momento de marcar y una foto que se borra a los 90 días. No se usan huellas ni reconocimiento facial.",
  },
  {
    pregunta: "¿Se pueden editar las marcas?",
    respuesta:
      "No. Una marca no se modifica ni se borra: cualquier corrección queda como un registro nuevo que conserva el original. Eso es lo que le da valor como prueba.",
  },
  {
    pregunta: "¿Qué pasa si dejo de pagar?",
    respuesta:
      "Tu equipo puede seguir marcando y tus datos no se borran ni se ocultan. Solo se pausa la administración hasta que regularices.",
  },
];

export default function InicioPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between p-(--espacio-lg)">
        <Logo tamano={32} />
        <nav aria-label="Cuenta" className="flex items-center gap-(--espacio-sm)">
          <Link
            href="/entrar"
            className="px-(--espacio-sm) py-(--espacio-xs) text-pequeno font-medium text-text-brand"
          >
            Entrar
          </Link>
          <Link href="/registro" className={`${primario} px-(--espacio-md) py-[10px] text-pequeno`}>
            Crear cuenta
          </Link>
        </nav>
      </header>

      <main className="flex flex-col gap-(--espacio-2xl) pb-(--espacio-2xl)">
        <section className="mx-auto grid w-full max-w-5xl items-center gap-(--espacio-xl) px-(--espacio-lg) pt-(--espacio-lg) md:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-(--espacio-lg)">
            <p className="text-etiqueta font-medium text-text-brand uppercase">
              Obligatorio desde el 1 de enero de 2027
            </p>
            <h1 className="font-titulo text-titulo-1 font-bold md:text-display">{TITULO}.</h1>
            <p className="text-cuerpo text-text-secondary">{DESCRIPCION}</p>
            <div className="flex flex-wrap gap-(--espacio-sm)">
              <Link href="/registro" className={primario}>
                Probar gratis {DIAS_DE_PRUEBA} días
              </Link>
              <a href="#precios" className={secundario}>
                Ver precios
              </a>
            </div>
            <p className="text-pequeno text-text-secondary">Sin tarjeta. Sin instalar nada.</p>
          </div>

          {/* Vista del celular del trabajador, dibujada con HTML para no cargar imágenes. */}
          <div
            aria-hidden="true"
            className="mx-auto w-full max-w-64 rounded-[32px] border border-border-strong bg-bg-surface p-(--espacio-md) shadow-sm"
          >
            <div className="flex flex-col gap-(--espacio-md) rounded-[20px] bg-bg-page p-(--espacio-md)">
              <p className="font-titulo text-titulo-3 font-bold">Hola, Mariana</p>
              <p className="font-titulo text-hora-grande font-bold tabular-nums">08:57</p>
              <div className="rounded-(--radio-md) bg-bg-brand py-(--espacio-md) text-center font-medium text-text-on-brand">
                Registrar entrada
              </div>
              <p className="rounded-(--radio-full) bg-bg-brand-soft px-(--espacio-sm) py-(--espacio-2xs) text-nota text-text-brand">
                Dentro de topes · 31.5 h esta semana
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="como-funciona"
          className="mx-auto w-full max-w-5xl px-(--espacio-lg)"
        >
          <h2 id="como-funciona" className="font-titulo text-titulo-2 font-bold">
            Cómo funciona
          </h2>
          <ol className="mt-(--espacio-lg) grid gap-(--espacio-lg) md:grid-cols-3">
            {PASOS.map((paso, index) => (
              <li
                key={paso.titulo}
                className="flex flex-col gap-(--espacio-xs) rounded-(--radio-lg) border border-border-default bg-bg-surface p-(--espacio-lg)"
              >
                <span className="flex size-8 items-center justify-center rounded-(--radio-full) bg-bg-brand-soft font-titulo font-bold text-text-brand">
                  {index + 1}
                </span>
                <h3 className="font-titulo text-titulo-3 font-bold">{paso.titulo}</h3>
                <p className="text-pequeno text-text-secondary">{paso.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="ley" className="bg-bg-brand-soft">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-md) px-(--espacio-lg) py-(--espacio-2xl)">
            <h2 id="ley" className="font-titulo text-titulo-2 font-bold">
              Qué dice la ley
            </h2>
            <p className="max-w-3xl">
              El artículo 132, fracción XXXIV, de la Ley Federal del Trabajo obliga a todo patrón a
              llevar un <strong>registro electrónico</strong> de la jornada de cada persona, con su
              hora de inicio y de término, y a entregarlo a la autoridad laboral cuando lo pida. La
              obligación empieza el <strong>1 de enero de 2027</strong> y aplica a negocios de
              cualquier tamaño.
            </p>
            <ul className="grid max-w-3xl gap-(--espacio-sm) text-pequeno md:grid-cols-2">
              <li className="rounded-(--radio-md) bg-bg-surface p-(--espacio-md)">
                El registro hace prueba plena cuando fue acordado entre el patrón y la persona
                trabajadora. Mi Jornada incluye ese convenio y recaba su aceptación.
              </li>
              <li className="rounded-(--radio-md) bg-bg-surface p-(--espacio-md)">
                No llevarlo se sanciona con multa de 250 a 5,000 UMA (artículo 994, fracción IV
                Bis). Con el registro al día, una inspección se atiende en minutos.
              </li>
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="precios"
          id="precios"
          className="mx-auto w-full max-w-5xl scroll-mt-(--espacio-lg) px-(--espacio-lg)"
        >
          <h2 className="font-titulo text-titulo-2 font-bold" id="precios-titulo">
            Precios
          </h2>
          <p className="mt-(--espacio-xs) text-text-secondary">
            {DIAS_DE_PRUEBA} días gratis, sin tarjeta. Precios en pesos con IVA incluido.
          </p>
          <ul className="mt-(--espacio-lg) grid gap-(--espacio-lg) md:grid-cols-3">
            {PLANES_PAGADOS.map((plan) => {
              const datos = PLANES[plan];
              return (
                <li
                  key={plan}
                  className="flex flex-col gap-(--espacio-sm) rounded-(--radio-lg) border border-border-default bg-bg-surface p-(--espacio-lg)"
                >
                  <h3 className="font-titulo text-titulo-3 font-bold">{datos.nombre}</h3>
                  <p className="text-pequeno text-text-secondary">{datos.descripcion}</p>
                  <p>
                    <span className="font-titulo text-titulo-1 font-bold">
                      {pesos(datos.mensual)}
                    </span>{" "}
                    <span className="text-pequeno text-text-secondary">al mes</span>
                  </p>
                  <p className="text-pequeno text-text-secondary">
                    o {pesos(datos.anual)} al año (2 meses gratis)
                  </p>
                  <Link href="/registro" className={`${secundario} mt-auto`}>
                    Empezar con {datos.nombre}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-(--espacio-md) text-pequeno text-text-secondary">
            Todos los planes incluyen marcaje desde celular y kiosco, incidencias, reportes para
            inspección y soporte por correo.
          </p>
        </section>

        <section aria-labelledby="preguntas" className="mx-auto w-full max-w-3xl px-(--espacio-lg)">
          <h2 id="preguntas" className="font-titulo text-titulo-2 font-bold">
            Preguntas frecuentes
          </h2>
          <div className="mt-(--espacio-md) divide-y divide-border-default">
            {PREGUNTAS.map((item) => (
              <details key={item.pregunta} className="group py-(--espacio-md)">
                <summary className="cursor-pointer font-medium marker:text-text-brand">
                  {item.pregunta}
                </summary>
                <p className="mt-(--espacio-xs) text-pequeno text-text-secondary">
                  {item.respuesta}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="empezar" className="mx-auto w-full max-w-5xl px-(--espacio-lg)">
          <div className="flex flex-col items-start gap-(--espacio-md) rounded-(--radio-lg) bg-bg-inverse p-(--espacio-xl) text-text-inverse">
            <h2 id="empezar" className="font-titulo text-titulo-2 font-bold">
              Ten tu registro listo antes del 1 de enero
            </h2>
            <p className="max-w-2xl opacity-80">
              Crea tu cuenta, da de alta a tu equipo y empieza a registrar hoy. Si no te sirve, no
              pagas nada.
            </p>
            <Link href="/registro" className={`${boton} bg-bg-accent text-text-on-accent`}>
              Crear mi cuenta gratis
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-default">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-(--espacio-md) p-(--espacio-lg) text-pequeno text-text-secondary">
          <p>© 2026 Inzotec. Mi Jornada es un producto de Inzotec.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-(--espacio-md)">
            <Link href="/terminos" className="underline">
              Términos de servicio
            </Link>
            <Link href="/privacidad" className="underline">
              Aviso de privacidad
            </Link>
            <a href="mailto:hola@mijornada.xyz" className="underline">
              hola@mijornada.xyz
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
