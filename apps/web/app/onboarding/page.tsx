import { listCentros, listEmpresas, listTrabajadores } from "@mijornada/api";
import { Logo, Tarjeta, cx } from "@mijornada/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "../../lib/supabase/server.ts";
import { PasoCentro, PasoEmpresa, PasoMetodo, PasoResumen, PasoTrabajadores } from "./Pasos.tsx";

export const metadata: Metadata = { title: "Alta de tu negocio · Mi Jornada" };

const PASOS = ["Cuenta", "Empresa", "Centro", "Trabajadores", "Marcaje", "Empezar"];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const ctx = await getCtx();
  if (ctx === null) redirect("/entrar?siguiente=/onboarding");

  const sinEmpresa = ctx.sesion.tenantId === null;
  const [empresas, centros, trabajadores] = sinEmpresa
    ? [[], [], []]
    : await Promise.all([
        listEmpresas(ctx),
        listCentros(ctx),
        listTrabajadores(ctx, { limite: 200 }).then((pagina) => pagina.datos),
      ]);
  const empresa = empresas.find((e) => e.id === ctx.sesion.tenantId);
  if (empresa?.onboarding_completado_en) redirect("/panel");

  const { data: dispositivos } = sinEmpresa
    ? { data: [] }
    : await ctx.db.schema("tenants").from("dispositivo").select("centro_id");
  const centrosConKiosco = new Set((dispositivos ?? []).map((d) => d.centro_id));

  // El paso al que se ha llegado se deduce de lo ya guardado: se puede salir y retomar.
  const alcanzado = !empresa
    ? 2
    : centros.length === 0
      ? 3
      : trabajadores.length === 0
        ? 4
        : centros.some((c) => c.metodo_marcaje === null)
          ? 5
          : 6;
  const pedido = Number((await searchParams).paso);
  const paso = Number.isInteger(pedido) && pedido >= 2 && pedido <= alcanzado ? pedido : alcanzado;
  const primerCentro = centros[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-(--espacio-lg) p-(--espacio-lg)">
      <header className="flex items-center justify-between">
        <Logo tamano={32} />
        <p className="text-etiqueta font-medium text-text-secondary uppercase">
          Paso {paso} de {PASOS.length}
        </p>
      </header>

      <ol className="flex gap-(--espacio-2xs)" aria-label="Pasos del alta">
        {PASOS.map((nombre, index) => {
          const numero = index + 1;
          const visitable = numero >= 2 && numero <= alcanzado && numero !== paso;
          const contenido = (
            <>
              <span
                className={cx(
                  "block h-1 rounded-(--radio-full)",
                  numero <= paso
                    ? "bg-bg-brand"
                    : numero <= alcanzado
                      ? "bg-border-brand/40"
                      : "bg-border-default",
                )}
              />
              <span
                className={cx(
                  "mt-(--espacio-2xs) hidden text-nota sm:block",
                  numero === paso ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {nombre}
              </span>
            </>
          );
          return (
            <li key={nombre} className="flex-1" aria-current={numero === paso ? "step" : undefined}>
              {visitable ? (
                <Link href={`/onboarding?paso=${String(numero)}`}>{contenido}</Link>
              ) : (
                contenido
              )}
            </li>
          );
        })}
      </ol>

      <Tarjeta className="flex flex-col gap-(--espacio-lg)">
        {paso === 2 ? <PasoEmpresa empresa={empresa ?? null} /> : null}
        {paso === 3 ? <PasoCentro centro={primerCentro ?? null} /> : null}
        {paso === 4 ? <PasoTrabajadores centros={centros} trabajadores={trabajadores} /> : null}
        {paso === 5 ? (
          <PasoMetodo centros={centros} centrosConKiosco={[...centrosConKiosco]} />
        ) : null}
        {paso === 6 ? (
          <PasoResumen
            empresa={empresa?.razon_social ?? ""}
            centros={centros}
            trabajadores={trabajadores.length}
            kioscoUrl={process.env["NEXT_PUBLIC_KIOSCO_URL"] ?? "http://localhost:3001"}
          />
        ) : null}
      </Tarjeta>
    </main>
  );
}
