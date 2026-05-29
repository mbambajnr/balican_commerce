import { ImageResponse } from "next/og";

export const alt = "Industrial Products Catalog — Bali-Can Limited";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ProductsOGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #061633 0%, #1848CC 50%, #0C0C0C 100%)",
          fontFamily: "sans-serif",
          padding: "80px",
          gap: "24px",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "14px",
            background: "#D4AF37",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#061633",
            fontSize: "32px",
            fontWeight: 800,
          }}
        >
          BC
        </div>
        <span
          style={{
            color: "#FFFFFF",
            fontSize: "44px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textAlign: "center",
          }}
        >
          Industrial Products Catalog
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: "20px",
            fontWeight: 500,
            textAlign: "center",
            maxWidth: "700px",
          }}
        >
          HVAC · Electricals · Solar · Appliances · Industrial Equipment
        </span>
        <span
          style={{
            color: "#D4AF37",
            fontSize: "16px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginTop: "8px",
          }}
        >
          Bali-Can Limited · Ghana
        </span>
      </div>
    ),
    { ...size }
  );
}
