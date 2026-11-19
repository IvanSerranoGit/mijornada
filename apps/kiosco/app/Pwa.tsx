"use client";

import { reportarError } from "@mijornada/offline";
import { SerwistProvider } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";

/** Registra el service worker (solo en producción: en desarrollo estorba la recarga en caliente). */
export function Pwa({ children }: { children: ReactNode }) {
  // Los errores que nadie atrapa se avisan al servidor para poder diagnosticarlos.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportarError("ventana:error", event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportarError("ventana:promesa", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

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
