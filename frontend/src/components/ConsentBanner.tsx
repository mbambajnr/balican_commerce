"use client";

import { useState, useEffect } from "react";
import { getConsent, setConsent, hasConsented } from "@/lib/consent";

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasConsented()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    setConsent({ analytics: true, marketing: true });
    setVisible(false);
  };

  const acceptEssential = () => {
    setConsent({ analytics: false, marketing: false });
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-navy-dark p-4 shadow-2xl">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          <p className="font-semibold text-white">Cookie Consent</p>
          <p>
            We use cookies to improve your experience, analyze traffic, and serve
            targeted ads. You can choose which cookies to allow.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={acceptEssential}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
          >
            Essential Only
          </button>
          <button
            onClick={acceptAll}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-bold"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
