import type { MetadataRoute } from "next";

// El kiosco se instala en la tablet del negocio y corre a pantalla completa.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Jornada · Kiosco",
    short_name: "Kiosco",
    description: "Marcaje de entrada y salida en el local.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      { src: "/icono/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
