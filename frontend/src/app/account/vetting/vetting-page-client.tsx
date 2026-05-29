"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import VettingFormModal from "@/components/VettingFormModal";

export default function VettingFormPage() {
  return (
    <div>
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft size={16} weight="bold" />
          Back to Dashboard
        </Link>
      </div>
      <VettingFormModal />
    </div>
  );
}
