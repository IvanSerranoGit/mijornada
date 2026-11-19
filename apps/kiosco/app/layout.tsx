import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Pwa } from "./Pwa.tsx";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mi Jornada · Kiosco",
  description: "Marcaje de entrada y salida en kiosco",
  appleWebApp: { capable: true, title: "Mi Jornada", statusBarStyle: "default" },
  icons: { icon: "/icono/192", apple: "/icono/180" },
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-bg-inverse text-text-inverse">
        <Pwa>{children}</Pwa>
      </body>
    </html>
  );
}
