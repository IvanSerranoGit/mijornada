import { ImageResponse } from "next/og";

const SIZES = ["180", "192", "512"];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

// Ícono de la aplicación: el símbolo de Mi Jornada sobre el color de marca.
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = SIZES.includes(raw) ? Number(raw) : 192;
  const symbol = Math.round(size * 0.62);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0F766E",
      }}
    >
      <svg width={symbol} height={symbol} viewBox="0 0 64 64" fill="none">
        <path d="M50 8H38V42H50V8Z" fill="#FFFFFF" />
        <path
          d="M50 40V44C50 50.627 44.627 56 38 56H24C17.373 56 12 50.627 12 44V40"
          strokeWidth="12"
          stroke="#FFFFFF"
        />
        <path d="M22 8H10V20H22V8Z" fill="#A3E635" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
