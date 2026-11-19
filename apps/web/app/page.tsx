import { Logo } from "@mijornada/ui";

// Marcador de posición: el onboarding llega en la fase 1 del sprint 2.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-(--espacio-lg) p-(--espacio-xl)">
      <Logo />
      <p className="text-text-secondary">Registro electrónico de jornada laboral</p>
    </main>
  );
}
