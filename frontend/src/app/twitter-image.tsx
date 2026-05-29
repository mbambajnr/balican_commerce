import { ImageResponse } from "next/og";

export const alt = "Bali-Can Limited — Industrial Solutions";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

export default function TwitterImage() {
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
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "#D4AF37",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#061633",
              fontSize: "24px",
              fontWeight: 800,
            }}
          >
            BC
          </div>
          <span style={{ color: "#FFFFFF", fontSize: "40px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Bali-Can Limited
          </span>
        </div>
        <span style={{ color: "#D4AF37", fontSize: "18px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Industrial Solutions · Ghana
        </span>
      </div>
    ),
    { ...size }
  );
}
