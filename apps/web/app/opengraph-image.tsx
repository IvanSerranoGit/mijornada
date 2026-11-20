import { ImageResponse } from "next/og";

export const alt = "Mi Jornada: registro electrónico de jornada laboral";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagen para compartir el sitio en redes y mensajería.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0F766E",
        color: "#FFFFFF",
        padding: 72,
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>mi jornada</div>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
        El registro de jornada que pide la STPS, desde el celular.
      </div>
      <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>
        Obligatorio desde el 1 de enero de 2027 · 14 días gratis
      </div>
    </div>,
    size,
  );
}
