import { createSerwistRoute } from "@serwist/turbopack";

// Sirve el service worker (app/sw.ts) en /serwist/sw.js con su lista de precarga.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
  },
);
