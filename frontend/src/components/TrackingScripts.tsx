"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { analyticsAllowed, marketingAllowed } from "@/lib/consent";
import { captureUTM } from "@/lib/utm";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "";
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

/* ── Fire conversion events ── */
export function fireConversion(
  event: string,
  data?: Record<string, string | number>,
) {
  if (typeof window === "undefined") return;
  try {
    if (analyticsAllowed()) {
      // GA4 gtag
      if ((window as any).gtag) {
        (window as any).gtag("event", event, data);
      }
    }
    if (marketingAllowed()) {
      // Meta Pixel
      if ((window as any).fbq) {
        (window as any).fbq("track", event, data);
      }
    }
  } catch {
    /* noop */
  }
}

export default function TrackingScripts() {
  const pathname = usePathname();

  /* Capture UTM params on every page load */
  useEffect(() => {
    captureUTM();
  }, [pathname]);

  const hasGTM = !!GTM_ID;
  const hasGA = !!GA_ID;
  const hasMeta = !!META_PIXEL_ID;

  return (
    <>
      {/* Google Tag Manager (marketing) */}
      {hasGTM && marketingAllowed() && (
        <Script
          id="gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
      )}

      {/* Google Analytics (analytics) */}
      {hasGA && analyticsAllowed() && (
        <>
          <Script
            id="ga-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          />
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', {
  send_page_view: true,
  anonymize_ip: true,
});`,
            }}
          />
        </>
      )}

      {/* Meta Pixel (marketing) */}
      {hasMeta && marketingAllowed() && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`,
          }}
        />
      )}

      {/* GTM noscript iframe */}
      {hasGTM && marketingAllowed() && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      )}
    </>
  );
}
