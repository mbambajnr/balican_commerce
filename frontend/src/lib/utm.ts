const STORAGE_KEY = "ss_utm";

export interface UTMParams {
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer_url?: string;
}

function readFromURL(): UTMParams {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const params: UTMParams = {};
  const map: Record<string, keyof UTMParams> = {
    utm_source: "utm_source",
    utm_campaign: "utm_campaign",
    utm_medium: "utm_medium",
    utm_term: "utm_term",
    utm_content: "utm_content",
    gclid: "gclid",
    fbclid: "fbclid",
  };
  for (const [key, store] of Object.entries(map)) {
    const val = p.get(key);
    if (val) params[store] = val;
  }
  return params;
}

export function captureUTM(): void {
  if (typeof window === "undefined") return;
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) return;
  const params = readFromURL();
  params.referrer_url = document.referrer || undefined;
  if (Object.keys(params).length > 0) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  }
}

export function getUTM(): UTMParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
