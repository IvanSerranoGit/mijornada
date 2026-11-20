import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SITE_URL } from "../lib/supabase/env.ts";
import { Pwa } from "./Pwa.tsx";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Mi Jornada",
  description: "Registro electrónico de jornada laboral",
  appleWebApp: { capable: true, title: "Mi Jornada", statusBarStyle: "default" },
  icons: { icon: "/icono/192", apple: "/icono/180" },
};

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <Pwa>{children}</Pwa>
      </body>
    </html>
  );
}
