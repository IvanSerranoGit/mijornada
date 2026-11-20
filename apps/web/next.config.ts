import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: [
    "@mijornada/api",
    "@mijornada/dominio",
    "@mijornada/offline",
    "@mijornada/ui",
  ],
  // Chromium para los PDF: se carga en tiempo de ejecución, no se empaqueta.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
};

export default nextConfig;
