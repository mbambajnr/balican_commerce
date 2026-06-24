/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // Next.js dev mode executes webpack modules via eval(), which requires
    // 'unsafe-eval' in the CSP. Without it the browser blocks all client JS,
    // React never hydrates, and client-side data fetches (e.g. the marketplace)
    // hang forever. HMR also needs a websocket connection. These relaxations
    // apply to development only — production keeps the strict policy.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com"
      : "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com";
    const connectSrc = isDev
      ? "connect-src 'self' ws: wss: https://api.paystack.co https://www.google-analytics.com"
      : "connect-src 'self' https://api.paystack.co https://www.google-analytics.com";

    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      connectSrc,
      "frame-src 'self' https://js.paystack.co",
      "upgrade-insecure-requests",
    ].join("; ");

    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

module.exports = nextConfig;
