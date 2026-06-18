import type { Metadata } from "next";
import "./globals.css";
import { outfit, bodyFont } from "./fonts";
import { Providers } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "react-hot-toast";
import Navbar from "./navbar";
import Footer from "@/components/Footer";
import ConsentBanner from "@/components/ConsentBanner";
import TrackingScripts from "@/components/TrackingScripts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Bali-Can Limited — B2B Sourcing & Verified Suppliers in Ghana",
    template: "%s | Bali-Can Limited",
  },
  description: "Post sourcing requests, compare proposals from verified suppliers, and manage eligible Ghanaian B2B purchases on approved GH₵ credit terms.",
  openGraph: {
    type: "website",
    locale: "en_GH",
    siteName: "Bali-Can Limited",
    title: "Bali-Can Limited — B2B Sourcing & Verified Suppliers in Ghana",
    description: "Post requirements, compare verified supplier proposals, and close eligible B2B deals on approved GH₵ credit terms.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bali-Can Limited — B2B Sourcing & Verified Suppliers in Ghana",
    description: "Post requirements, compare verified supplier proposals, and manage the deal through fulfillment.",
    images: ["/og-default.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${bodyFont.variable}`}>
      <body className="min-h-[100dvh] bg-surface antialiased">
        <Providers>
          <AuthProvider>
            <Navbar />
            <main className="min-h-[60dvh]">{children}</main>
            <Footer />
          </AuthProvider>
        </Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#18181b",
              color: "#fafafa",
              borderRadius: "12px",
              fontSize: "14px",
              border: "1px solid #27272a",
            },
          }}
        />
        <ConsentBanner />
        <TrackingScripts />
      </body>
    </html>
  );
}
