import { Boton, Campo, Chip, Logo, Tarjeta } from "@mijornada/ui";
import { notFound } from "next/navigation";

// Muestrario de componentes para revisar contra Figma. Solo en desarrollo.
export default function UiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-(--espacio-xl) p-(--espacio-xl)">
      <h1 className="font-titulo text-titulo-1 font-bold">Componentes</h1>

      <section className="flex flex-wrap items-center gap-(--espacio-lg) bg-bg-subtle p-(--espacio-xl)">
        <Boton>Guardar</Boton>
        <Boton tamano="l">Guardar</Boton>
        <Boton estilo="secundario">Guardar</Boton>
        <Boton estilo="secundario" tamano="l">
          Guardar
        </Boton>
        <Boton estilo="fantasma">Guardar</Boton>
        <Boton estilo="fantasma" tamano="l">
          Guardar
        </Boton>
        <Boton disabled>Guardar</Boton>
      </section>

      <section className="flex flex-wrap items-center gap-(--espacio-lg) bg-bg-subtle p-(--espacio-xl)">
        <Chip tono="bien">Estado</Chip>
        <Chip tono="alerta">Estado</Chip>
        <Chip tono="critico">Estado</Chip>
        <Chip tono="neutro">Estado</Chip>
      </section>

      <section className="grid grid-cols-3 gap-(--espacio-lg) bg-bg-subtle p-(--espacio-xl)">
        <Campo etiqueta="Nombre del trabajador" placeholder="Ej. Mariana López" />
        <Campo etiqueta="Nombre del trabajador" defaultValue="Mariana López" autoFocus />
        <Campo
          etiqueta="Nombre del trabajador"
          defaultValue="Mariana López"
          error="Escribe el nombre completo"
        />
        <Campo etiqueta="Nombre del trabajador" placeholder="Ej. Mariana López" disabled />
      </section>

      <section className="flex flex-wrap items-center gap-(--espacio-xl) bg-bg-subtle p-(--espacio-xl)">
        <Logo />
        <Logo color="negro" />
        <span className="rounded-(--radio-md) bg-bg-inverse px-5 py-4">
          <Logo color="blanco" />
        </span>
        <Logo tipo="apilado" />
        <span className="rounded-(--radio-md) bg-bg-inverse px-5 py-4">
          <Logo tipo="apilado" color="blanco" />
        </span>
        <Logo tipo="simbolo" />
        <Logo tipo="simbolo" color="negro" />
        <Logo tamano={24} />
      </section>

      <Tarjeta className="flex flex-col gap-(--espacio-sm)">
        <p className="text-etiqueta font-medium text-text-secondary uppercase">Hoy</p>
        <p className="font-titulo text-hora-grande font-bold">08:57</p>
        <p className="text-text-secondary">Entrada registrada en Centro A</p>
      </Tarjeta>
    </main>
  );
}
