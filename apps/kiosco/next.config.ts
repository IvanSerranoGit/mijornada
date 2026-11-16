import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes internos se consumen como código fuente TypeScript.
  transpilePackages: ["@mijornada/api", "@mijornada/dominio"],
};

export default nextConfig;
