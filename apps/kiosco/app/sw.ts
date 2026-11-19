/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Precarga la aplicación y guarda las pantallas visitadas para abrirlas sin red.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  // Sin precarga de navegación: en Safari de iPhone provoca cargas interrumpidas.
  navigationPreload: false,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Al recuperar la red, el navegador dispara esta sincronización: se avisa a las
// pantallas abiertas para que envíen los marcajes pendientes de su cola local.
self.addEventListener("sync", (event) => {
  const sync = event as ExtendableEvent & { tag: string };
  if (sync.tag !== "cola-marcajes") return;
  sync.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) client.postMessage({ tipo: "sincronizar-cola" });
    }),
  );
});
