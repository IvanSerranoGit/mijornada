"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

/** Registra el service worker (solo en producción: en desarrollo estorba la recarga en caliente). */
export function Pwa({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      options={{ scope: "/" }}
      disable={process.env.NODE_ENV !== "production"}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
