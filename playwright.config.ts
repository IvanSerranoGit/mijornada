import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta contra las dos apps compiladas (`next start`) y el
// Supabase local. Antes: `pnpm db:start`, `pnpm env:local` y `pnpm build`.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "e2e/resultados",
  use: {
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    video: "on",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "android",
      use: {
        ...devices["Pixel 7"],
        launchOptions: {
          // Cámara simulada para la foto y el QR del kiosco.
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
    // Safari de iPhone: solo el marcaje con foto, que depende del motor del navegador.
    { name: "iphone", use: { ...devices["iPhone 15"] }, testMatch: /foto\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @mijornada/web start",
      url: "http://localhost:3000/entrar",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @mijornada/kiosco start",
      url: "http://localhost:3001",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
