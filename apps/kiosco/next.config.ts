import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: [
    "@mijornada/api",
    "@mijornada/dominio",
    "@mijornada/offline",
    "@mijornada/ui",
  ],
};

export default nextConfig;
