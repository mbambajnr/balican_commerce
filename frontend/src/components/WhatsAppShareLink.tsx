"use client";

import { useEffect, useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react";

export default function WhatsAppShareLink({ title, className = "" }: { title: string; className?: string }) {
  const [href, setHref] = useState(() => `https://wa.me/?text=${encodeURIComponent(title)}`);

  useEffect(() => {
    setHref(`https://wa.me/?text=${encodeURIComponent(`${title}\n${window.location.href}`)}`);
  }, [title]);

  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 ${className}`}>
      <WhatsappLogo size={18} weight="fill" /> Share via WhatsApp
    </a>
  );
}
