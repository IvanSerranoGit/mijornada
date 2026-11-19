"use client";

import { reportarError } from "@mijornada/offline";
import { useEffect, useState } from "react";

const MARCA = "mijornada-recuperacion";

/** Quita el service worker y sus cachés: una versión guardada a medias no debe dejar la app sin abrir. */
async function limpiar(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map((registro) => registro.unregister()));
  }
  if ("caches" in window) {
    const nombres = await caches.keys();
    await Promise.all(nombres.map((nombre) => caches.delete(nombre)));
  }
}

// Pantalla de último recurso: avisa del error al servidor y, la primera vez, limpia
// lo guardado por el service worker y recarga. La cola de marcajes (IndexedDB) no se toca.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [recuperando, setRecuperando] = useState(true);

  useEffect(() => {
    reportarError(`global:${window.location.pathname}`.slice(0, 60), error);
    let yaSeIntento = true;
    try {
      yaSeIntento = sessionStorage.getItem(MARCA) !== null;
      sessionStorage.setItem(MARCA, "1");
    } catch {
      // Sin sessionStorage no se puede saber si ya se intentó: no se recarga sola.
    }
    if (yaSeIntento) {
      setRecuperando(false);
      return;
    }
    void limpiar()
      .catch(() => undefined)
      .then(() => {
        window.location.reload();
      });
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
        {recuperando ? (
          <p>Cargando Mi Jornada…</p>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: 0 }}>No se pudo abrir Mi Jornada</h1>
            <p style={{ margin: 0 }}>Revisa tu conexión e intenta de nuevo.</p>
            <button
              type="button"
              style={{ padding: "12px 20px", fontSize: 16 }}
              onClick={() => {
                void limpiar()
                  .catch(() => undefined)
                  .then(() => {
                    window.location.reload();
                  });
              }}
            >
              Reintentar
            </button>
          </>
        )}
      </body>
    </html>
  );
}
