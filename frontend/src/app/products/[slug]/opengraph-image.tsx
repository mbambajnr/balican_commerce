import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

async function getProduct(slug: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API}/products/${slug}`, { signal: controller.signal, next: { revalidate: 60 } });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data.product;
  } catch {
    return null;
  }
}

export default async function ProductOGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  const imageUrl = product?.primary_image?.url || product?.images?.[0]?.url || product?.images_list?.[0]?.url;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #061633 0%, #1848CC 50%, #0C0C0C 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {imageUrl && (
          <div
            style={{
              width: "50%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img
              src={imageUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: imageUrl ? "48px" : "80px",
            gap: "16px",
          }}
        >
          {product?.category_name && (
            <span
              style={{
                color: "#D4AF37",
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {product.category_name}
            </span>
          )}
          <span
            style={{
              color: "#FFFFFF",
              fontSize: "36px",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              display: "-webkit-box",
              WebkitLineClamp: "4",
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product?.name || "Bali-Can Limited"}
          </span>
          {product?.brand && (
            <span
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "16px",
                fontWeight: 500,
              }}
            >
              {product.brand}
            </span>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "#D4AF37",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#061633",
                fontSize: "14px",
                fontWeight: 800,
              }}
            >
              BC
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>
              Bali-Can Limited · Ghana
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
