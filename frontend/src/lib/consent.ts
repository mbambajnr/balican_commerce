const CONSENT_KEY = "ss_cookie_consent";

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

const DEFAULT_CONSENT: ConsentPreferences = {
  analytics: false,
  marketing: false,
  timestamp: 0,
};

export function getConsent(): ConsentPreferences {
  if (typeof window === "undefined") return DEFAULT_CONSENT;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return { ...DEFAULT_CONSENT, timestamp: 0 };
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_CONSENT, timestamp: 0 };
  }
}

export function setConsent(prefs: Partial<ConsentPreferences>): void {
  if (typeof window === "undefined") return;
  const current = getConsent();
  const updated = { ...current, ...prefs, timestamp: Date.now() };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(updated));
}

export function hasConsented(): boolean {
  const c = getConsent();
  return c.analytics || c.marketing;
}

export function analyticsAllowed(): boolean {
  return getConsent().analytics;
}

export function marketingAllowed(): boolean {
  return getConsent().marketing;
}
