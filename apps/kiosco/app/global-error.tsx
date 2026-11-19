"use client";

import { reportarError } from "@mijornada/offline";
import { useEffect } from "react";

// Pantalla de último recurso cuando la aplicación no logra arrancar (por ejemplo,
// si la red se corta a media carga). Avisa del error al servidor y ofrece reintentar.
// La cola de marcajes vive en IndexedDB y no se ve afectada.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportarError(`global:${window.location.pathname}`.slice(0, 60), error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0 }}>No se pudo abrir Mi Jornada</h1>
        <p style={{ margin: 0 }}>Revisa tu conexión e intenta de nuevo.</p>
        <button
          type="button"
          style={{ padding: "12px 20px", fontSize: 16 }}
          onClick={() => {
            window.location.reload();
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
