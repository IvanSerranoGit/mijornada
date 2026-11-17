import { Logo } from "@mijornada/ui";

// Marcador de posición: el kiosco llega en la fase 4 del sprint 2.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-lg) p-(--espacio-xl)">
      <Logo tipo="apilado" color="blanco" />
      <p className="font-titulo text-hora-grande font-bold">Kiosco</p>
    </main>
  );
}
