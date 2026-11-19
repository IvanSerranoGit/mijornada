"use client";

import type { listCentros, listEmpresas, listTrabajadores } from "@mijornada/api";
import { SECTORES, suggestJurisdiccion, ZONAS_HORARIAS_MX } from "@mijornada/dominio";
import { Boton, Campo, Chip, Selector, cx } from "@mijornada/ui";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import {
  agregarTrabajador,
  buscarDireccion,
  generarCodigoEnlace,
  guardarCentro,
  guardarEmpresa,
  guardarMetodos,
  terminarOnboarding,
  type FormState,
  type MetodoState,
  type TrabajadorState,
} from "./actions.ts";

type Empresa = Awaited<ReturnType<typeof listEmpresas>>[number];
type Centro = Awaited<ReturnType<typeof listCentros>>[number];
type Trabajador = Awaited<ReturnType<typeof listTrabajadores>>["datos"][number];

const DIAS = [
  { valor: 1, corto: "L", nombre: "Lunes" },
  { valor: 2, corto: "M", nombre: "Martes" },
  { valor: 3, corto: "X", nombre: "Miércoles" },
  { valor: 4, corto: "J", nombre: "Jueves" },
  { valor: 5, corto: "V", nombre: "Viernes" },
  { valor: 6, corto: "S", nombre: "Sábado" },
  { valor: 7, corto: "D", nombre: "Domingo" },
];

function Encabezado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-(--espacio-2xs)">
      <h1 className="font-titulo text-titulo-2 font-bold">{titulo}</h1>
      <p className="text-text-secondary">{children}</p>
    </header>
  );
}

function ErrorDeFormulario({ estado }: { estado: FormState }) {
  return estado.error ? (
    <p role="alert" className="text-pequeno text-status-critical">
      {estado.error}
    </p>
  ) : null;
}

function Opcion({
  type,
  name,
  value,
  defaultChecked,
  checked,
  onChange,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value?: string | number;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-(--espacio-xs) text-pequeno">
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-(--color-bg-brand)"
      />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- paso 2

export function PasoEmpresa({ empresa }: { empresa: Empresa | null }) {
  const [estado, accion, enviando] = useActionState(guardarEmpresa, {});
  const [jurisdiccion, setJurisdiccion] = useState(empresa?.jurisdiccion ?? "local");

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <Encabezado titulo="Tu empresa">
        Con estos datos se identifica al patrón en los reportes.
      </Encabezado>
      <Campo
        etiqueta="Razón social o nombre del negocio"
        name="razon_social"
        defaultValue={empresa?.razon_social}
        placeholder="Ej. Tortillería La Esperanza"
        required
      />
      <Campo
        etiqueta="RFC (opcional)"
        name="rfc"
        defaultValue={empresa?.rfc ?? ""}
        placeholder="XAXX010101000"
        nota="Puedes agregarlo después."
      />
      <Selector etiqueta="Tamaño" name="tamano" defaultValue={empresa?.tamano ?? "micro"}>
        <option value="micro">Micro (hasta 10 personas)</option>
        <option value="pequena">Pequeña (11 a 50)</option>
        <option value="mediana">Mediana (51 a 250)</option>
        <option value="grande">Grande (más de 250)</option>
      </Selector>
      <Selector
        etiqueta="Sector"
        name="sector"
        defaultValue={empresa?.sector ?? SECTORES[0]?.nombre}
        onChange={(event) => {
          setJurisdiccion(suggestJurisdiccion(event.target.value));
        }}
      >
        {SECTORES.map((sector) => (
          <option key={sector.nombre}>{sector.nombre}</option>
        ))}
      </Selector>
      <fieldset className="flex flex-col gap-(--espacio-xs)">
        <legend className="mb-(--espacio-xs) text-pequeno font-medium">
          Autoridad laboral que te corresponde
        </legend>
        <Opcion
          type="radio"
          name="jurisdiccion"
          value="local"
          checked={jurisdiccion === "local"}
          onChange={() => {
            setJurisdiccion("local");
          }}
        >
          Local (la mayoría de los negocios)
        </Opcion>
        <Opcion
          type="radio"
          name="jurisdiccion"
          value="federal"
          checked={jurisdiccion === "federal"}
          onChange={() => {
            setJurisdiccion("federal");
          }}
        >
          Federal (ramas industriales reservadas a la federación)
        </Opcion>
        <p className="text-nota text-text-secondary">
          La sugerimos según tu sector; puedes cambiarla.
        </p>
      </fieldset>
      <ErrorDeFormulario estado={estado} />
      <Boton type="submit" tamano="l" disabled={enviando}>
        Guardar y continuar
      </Boton>
    </form>
  );
}

// ---------------------------------------------------------------- paso 3

export function PasoCentro({ centro }: { centro: Centro | null }) {
  const [estado, accion, enviando] = useActionState(guardarCentro, {});
  const [direccion, setDireccion] = useState(centro?.direccion ?? "");
  const [lat, setLat] = useState(centro?.lat?.toString() ?? "");
  const [lng, setLng] = useState(centro?.lng?.toString() ?? "");
  const [busqueda, setBusqueda] = useState<{ error?: string; encontrado?: string }>({});
  const [buscando, startBusqueda] = useTransition();

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-md)">
      <Encabezado titulo="Tu primer centro de trabajo">
        Es el lugar donde tu equipo registra su jornada. Después puedes agregar más.
      </Encabezado>
      {centro ? <input type="hidden" name="id" value={centro.id} /> : null}
      <Campo
        etiqueta="Nombre"
        name="nombre"
        defaultValue={centro?.nombre}
        placeholder="Ej. Matriz"
        required
      />
      <div className="flex flex-col gap-(--espacio-xs)">
        <Campo
          etiqueta="Dirección (opcional)"
          name="direccion"
          value={direccion}
          onChange={(event) => {
            setDireccion(event.target.value);
          }}
          placeholder="Calle, número, colonia, ciudad"
        />
        <div className="flex items-center gap-(--espacio-sm)">
          <Boton
            estilo="secundario"
            disabled={buscando || direccion.trim() === ""}
            onClick={() => {
              startBusqueda(async () => {
                const resultado = await buscarDireccion(direccion);
                setBusqueda(resultado);
                if (resultado.lat !== undefined && resultado.lng !== undefined) {
                  setLat(resultado.lat.toFixed(6));
                  setLng(resultado.lng.toFixed(6));
                }
              });
            }}
          >
            {buscando ? "Buscando…" : "Ubicar en el mapa"}
          </Boton>
          {busqueda.error ? (
            <p className="text-nota text-status-warning-text">{busqueda.error}</p>
          ) : null}
          {busqueda.encontrado ? (
            <p className="text-nota text-text-secondary">{busqueda.encontrado}</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-(--espacio-md) sm:grid-cols-3">
        <Campo
          etiqueta="Latitud"
          name="lat"
          inputMode="decimal"
          value={lat}
          onChange={(event) => {
            setLat(event.target.value);
          }}
          placeholder="19.432608"
        />
        <Campo
          etiqueta="Longitud"
          name="lng"
          inputMode="decimal"
          value={lng}
          onChange={(event) => {
            setLng(event.target.value);
          }}
          placeholder="-99.133209"
        />
        <Campo
          etiqueta="Radio (metros)"
          name="radio_m"
          type="number"
          min={10}
          defaultValue={centro?.radio_m ?? ""}
          placeholder="100"
        />
      </div>
      <p className="text-nota text-text-secondary">
        La ubicación y el radio son opcionales. Si los capturas, una marca hecha fuera de esa zona
        se registra igual y queda anotada; nunca se bloquea.
      </p>
      <Selector
        etiqueta="Zona horaria"
        name="zona_horaria"
        defaultValue={centro?.zona_horaria ?? "America/Mexico_City"}
      >
        {ZONAS_HORARIAS_MX.map((zona) => (
          <option key={zona.zona} value={zona.zona}>
            {zona.nombre}
          </option>
        ))}
      </Selector>
      <ErrorDeFormulario estado={estado} />
      <Boton type="submit" tamano="l" disabled={enviando}>
        Guardar y continuar
      </Boton>
    </form>
  );
}

// ---------------------------------------------------------------- paso 4

export function PasoTrabajadores({
  centros,
  trabajadores,
}: {
  centros: Centro[];
  trabajadores: Trabajador[];
}) {
  const [estado, accion, enviando] = useActionState<TrabajadorState, FormData>(
    agregarTrabajador,
    {},
  );
  const [formKey, setFormKey] = useState(0);
  const [vistas, setVistas] = useState<TrabajadorState["credenciales"][]>([]);

  // Cada alta exitosa agrega sus credenciales a la lista y limpia el formulario.
  if (estado.credenciales && !vistas.includes(estado.credenciales)) {
    setVistas([...vistas, estado.credenciales]);
    setFormKey(formKey + 1);
  }

  return (
    <div className="flex flex-col gap-(--espacio-lg)">
      <Encabezado titulo="Tu equipo">
        Agrega a cada persona con su horario. A cada una se le genera un PIN y un código QR para
        marcar.
      </Encabezado>

      {trabajadores.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-default rounded-(--radio-md) border border-border-default">
          {trabajadores.map((trabajador) => (
            <li
              key={trabajador.id}
              className="flex items-center justify-between px-(--espacio-md) py-(--espacio-sm)"
            >
              <span>
                <span className="font-medium">{trabajador.nombre}</span>
                {trabajador.puesto ? (
                  <span className="text-text-secondary"> · {trabajador.puesto}</span>
                ) : null}
              </span>
              {trabajador.menor_de_edad ? <Chip tono="neutro">Menor de edad</Chip> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {vistas.map((credenciales) =>
        credenciales ? (
          <section
            key={credenciales.pin + credenciales.nombre}
            className="flex items-center gap-(--espacio-md) rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md)"
          >
            <Image
              src={credenciales.qr}
              alt={`QR de ${credenciales.nombre}`}
              width={96}
              height={96}
              unoptimized
            />
            <div className="flex flex-col gap-(--espacio-2xs)">
              <p className="font-medium">{credenciales.nombre}</p>
              <p className="text-etiqueta font-medium text-text-secondary uppercase">PIN</p>
              <p className="font-titulo text-titulo-1 font-bold tracking-widest">
                {credenciales.pin}
              </p>
              <p className="text-nota text-text-secondary">
                Anótalo o imprime esta pantalla: por seguridad no se vuelve a mostrar.
              </p>
            </div>
          </section>
        ) : null,
      )}

      <form key={formKey} action={accion} className="flex flex-col gap-(--espacio-md)">
        <h2 className="font-titulo text-titulo-3 font-bold">Agregar persona</h2>
        {centros.length > 1 ? (
          <Selector etiqueta="Centro de trabajo" name="centro_id">
            {centros.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.nombre}
              </option>
            ))}
          </Selector>
        ) : (
          <input type="hidden" name="centro_id" value={centros[0]?.id ?? ""} />
        )}
        <div className="grid grid-cols-1 gap-(--espacio-md) sm:grid-cols-2">
          <Campo
            etiqueta="Nombre completo"
            name="nombre"
            placeholder="Ej. Mariana López"
            required
          />
          <Campo etiqueta="Puesto" name="puesto" placeholder="Ej. Cajera" />
        </div>
        <fieldset>
          <legend className="mb-(--espacio-xs) text-pequeno font-medium">Días que trabaja</legend>
          <div className="flex flex-wrap gap-(--espacio-md)">
            {DIAS.map((dia) => (
              <Opcion
                key={dia.valor}
                type="checkbox"
                name="dias"
                value={dia.valor}
                defaultChecked={dia.valor <= 5}
              >
                <span title={dia.nombre}>{dia.corto}</span>
              </Opcion>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-(--espacio-md) sm:grid-cols-3">
          <Campo etiqueta="Entrada" name="hora_entrada" type="time" defaultValue="09:00" required />
          <Campo etiqueta="Salida" name="hora_salida" type="time" defaultValue="18:00" required />
          <Selector etiqueta="Descanso semanal" name="descanso_semanal" defaultValue="7">
            {DIAS.map((dia) => (
              <option key={dia.valor} value={dia.valor}>
                {dia.nombre}
              </option>
            ))}
          </Selector>
        </div>
        <Opcion type="checkbox" name="menor_de_edad">
          Es menor de 18 años (no puede trabajar tiempo extra)
        </Opcion>
        <details className="text-pequeno">
          <summary className="cursor-pointer font-medium text-text-brand">
            CURP y NSS (opcionales)
          </summary>
          <div className="mt-(--espacio-md) grid grid-cols-1 gap-(--espacio-md) sm:grid-cols-2">
            <Campo etiqueta="CURP" name="curp" maxLength={18} />
            <Campo etiqueta="NSS" name="nss" inputMode="numeric" maxLength={11} />
          </div>
          <p className="mt-(--espacio-xs) text-nota text-text-secondary">Se guardan cifrados.</p>
        </details>
        <ErrorDeFormulario estado={estado} />
        <Boton
          type="submit"
          estilo={trabajadores.length > 0 ? "secundario" : "primario"}
          disabled={enviando}
        >
          {enviando ? "Agregando…" : "Agregar persona"}
        </Boton>
      </form>

      {trabajadores.length > 0 ? (
        <Link
          href="/onboarding?paso=5"
          className="inline-flex items-center justify-center rounded-(--radio-md) bg-bg-brand px-(--espacio-lg) py-[18px] font-medium text-text-on-brand hover:bg-bg-brand-hover"
        >
          Continuar
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- paso 5

const METODOS = [
  {
    valor: "kiosco",
    titulo: "Kiosco",
    detalle: "Una tablet o teléfono del negocio, fijo en el local.",
  },
  { valor: "telefono", titulo: "Teléfono propio", detalle: "Cada persona marca desde su celular." },
  { valor: "ambos", titulo: "Ambos", detalle: "Kiosco en el local y también desde el celular." },
] as const;

export function PasoMetodo({
  centros,
  centrosConKiosco,
}: {
  centros: Centro[];
  centrosConKiosco: string[];
}) {
  const [estado, accion, enviando] = useActionState<MetodoState, FormData>(guardarMetodos, {});
  const [metodos, setMetodos] = useState<Record<string, string>>(() =>
    Object.fromEntries(centros.map((centro) => [centro.id, centro.metodo_marcaje ?? "ambos"])),
  );

  return (
    <form action={accion} className="flex flex-col gap-(--espacio-lg)">
      <Encabezado titulo="¿Cómo va a marcar tu equipo?">
        Elige el método de cada centro. Lo puedes cambiar cuando quieras.
      </Encabezado>

      {centros.map((centro) => {
        const metodo = metodos[centro.id] ?? "ambos";
        return (
          <fieldset key={centro.id} className="flex flex-col gap-(--espacio-sm)">
            <legend className="mb-(--espacio-sm) font-titulo text-titulo-3 font-bold">
              {centro.nombre}
            </legend>
            <input type="hidden" name="centro_id" value={centro.id} />
            {centrosConKiosco.includes(centro.id) ? (
              <input type="hidden" name={`tiene_kiosco_${centro.id}`} value="1" />
            ) : null}
            {METODOS.map((opcion) => (
              <label
                key={opcion.valor}
                className={cx(
                  "flex cursor-pointer items-start gap-(--espacio-sm) rounded-(--radio-md) border p-(--espacio-md)",
                  metodo === opcion.valor
                    ? "border-border-brand bg-bg-brand-soft"
                    : "border-border-default",
                )}
              >
                <input
                  type="radio"
                  name={`metodo_${centro.id}`}
                  value={opcion.valor}
                  checked={metodo === opcion.valor}
                  onChange={() => {
                    setMetodos({ ...metodos, [centro.id]: opcion.valor });
                  }}
                  className="mt-1 size-4 accent-(--color-bg-brand)"
                />
                <span>
                  <span className="block font-medium">{opcion.titulo}</span>
                  <span className="block text-pequeno text-text-secondary">{opcion.detalle}</span>
                </span>
              </label>
            ))}
            {metodo !== "telefono" ? (
              <Opcion
                type="checkbox"
                name={`foto_kiosco_${centro.id}`}
                defaultChecked={centro.foto_en_kiosco}
              >
                Tomar foto al marcar en el kiosco
              </Opcion>
            ) : null}
            {metodo !== "kiosco" ? (
              <Opcion
                type="checkbox"
                name={`foto_telefono_${centro.id}`}
                defaultChecked={centro.foto_en_telefono}
              >
                Pedir foto al marcar desde el celular
              </Opcion>
            ) : null}
          </fieldset>
        );
      })}

      {estado.codigos?.map((enlace) => (
        <section
          key={enlace.codigo}
          className="rounded-(--radio-md) bg-bg-brand-soft p-(--espacio-md)"
        >
          <p className="text-etiqueta font-medium text-text-secondary uppercase">
            Código para vincular el kiosco de {enlace.centro}
          </p>
          <p className="font-titulo text-titulo-1 font-bold tracking-widest">{enlace.codigo}</p>
          <p className="text-nota text-text-secondary">
            Es de un solo uso y vence en 7 días. Anótalo: lo vas a teclear en la tablet.
          </p>
        </section>
      ))}

      <ErrorDeFormulario estado={estado} />
      {estado.guardado ? (
        <Link
          href="/onboarding?paso=6"
          className="inline-flex items-center justify-center rounded-(--radio-md) bg-bg-brand px-(--espacio-lg) py-[18px] font-medium text-text-on-brand hover:bg-bg-brand-hover"
        >
          Continuar
        </Link>
      ) : (
        <Boton type="submit" tamano="l" disabled={enviando}>
          Guardar
        </Boton>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- paso 6

export function PasoResumen({
  empresa,
  centros,
  trabajadores,
  kioscoUrl,
}: {
  empresa: string;
  centros: Centro[];
  trabajadores: number;
  kioscoUrl: string;
}) {
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [generando, startGenerar] = useTransition();
  const conKiosco = centros.filter((centro) => centro.metodo_marcaje !== "telefono");
  const conTelefono = centros.some((centro) => centro.metodo_marcaje !== "kiosco");

  return (
    <div className="flex flex-col gap-(--espacio-lg)">
      <Encabezado titulo="Todo listo">
        {empresa} quedó dada de alta con {centros.length}{" "}
        {centros.length === 1 ? "centro" : "centros"} y {trabajadores}{" "}
        {trabajadores === 1 ? "persona" : "personas"}.
      </Encabezado>

      {conKiosco.length > 0 ? (
        <section className="flex flex-col gap-(--espacio-sm)">
          <h2 className="font-titulo text-titulo-3 font-bold">Abrir el kiosco</h2>
          <ol className="list-decimal space-y-(--espacio-2xs) pl-(--espacio-lg) text-pequeno">
            <li>
              En la tablet o teléfono del negocio, abre{" "}
              <strong className="break-all">{kioscoUrl}</strong>.
            </li>
            <li>Teclea el código de enlace de 8 caracteres del centro.</li>
            <li>Cada persona marca con su PIN o mostrando su código QR.</li>
          </ol>
          {conKiosco.map((centro) => (
            <div key={centro.id} className="flex flex-wrap items-center gap-(--espacio-sm)">
              <Boton
                estilo="secundario"
                disabled={generando}
                onClick={() => {
                  startGenerar(async () => {
                    const resultado = await generarCodigoEnlace(centro.id);
                    if (resultado.codigo) setCodigos({ ...codigos, [centro.id]: resultado.codigo });
                    if (resultado.error) setErrores({ ...errores, [centro.id]: resultado.error });
                  });
                }}
              >
                Generar otro código para {centro.nombre}
              </Boton>
              {codigos[centro.id] ? (
                <span className="font-titulo text-titulo-3 font-bold tracking-widest">
                  {codigos[centro.id]}
                </span>
              ) : null}
              {errores[centro.id] ? (
                <span className="text-nota text-status-critical">{errores[centro.id]}</span>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {conTelefono ? (
        <section className="flex flex-col gap-(--espacio-sm)">
          <h2 className="font-titulo text-titulo-3 font-bold">Marcar desde el celular</h2>
          <p className="text-pequeno">
            Desde tu panel, en cada persona, encontrarás <strong>Invitar</strong>: genera un enlace
            personal para que instale la aplicación en su teléfono y marque desde ahí.
          </p>
        </section>
      ) : null}

      <form action={terminarOnboarding}>
        <Boton type="submit" tamano="l" className="w-full">
          Empezar
        </Boton>
      </form>
    </div>
  );
}
