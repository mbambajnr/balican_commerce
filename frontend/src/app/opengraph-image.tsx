import { ImageResponse } from "next/og";

export const alt = "Bali-Can Limited — B2B sourcing with verified suppliers in Ghana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
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
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#D4AF37",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#061633",
              fontSize: "28px",
              fontWeight: 800,
            }}
          >
            BC
          </div>
          <span style={{ color: "#FFFFFF", fontSize: "48px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Bali-Can Limited
          </span>
        </div>
        <span style={{ color: "#D4AF37", fontSize: "22px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Post requirements · Compare verified suppliers · Ghana
        </span>
      </div>
    ),
    { ...size }
  );
}
