import type { MetadataRoute } from "next";

// La PWA instalable es la del trabajador: abre directo en la pantalla de marcaje.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Jornada",
    short_name: "Mi Jornada",
    description: "Registra tu entrada y salida.",
    lang: "es-MX",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FDFCF9",
    theme_color: "#0F766E",
    icons: [
      { src: "/icono/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
