import Link from "next/link";
import { ArrowRight, CheckCircle, Circle, IdentificationCard, Tag } from "@phosphor-icons/react";

export default function ProviderReadinessCard({ insights, businessProfile }: { insights: any; businessProfile?: any }) {
  if (!insights) return null;
  const verificationComplete = insights.verificationStatus === "approved";
  const steps = [
    { complete: insights.hasCategories, label: "Select your supply categories", href: "/provider/profile" },
    { complete: businessProfile?.complete === true, label: "Complete your company profile", href: "/account/company-profile?returnTo=%2Fprovider" },
    { complete: verificationComplete, label: "Earn Balican Verified", href: "/provider/verification" },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-navy p-6 text-white sm:p-7">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/60"><Tag size={15} /> Your market pulse</div>
          <p className="mt-5 font-display text-4xl font-semibold">{insights.requestsInCategoriesLast60Days}</p>
          <p className="mt-1 max-w-xs text-sm leading-6 text-white/75">buyer request{insights.requestsInCategoriesLast60Days === 1 ? "" : "s"} posted in your categories over the past 60 days</p>
          {!insights.hasCategories && <Link href="/provider/profile" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-navy">Choose categories <ArrowRight size={15} /></Link>}
        </div>
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-2"><IdentificationCard size={20} className="text-accent" /><h2 className="font-display text-lg font-semibold text-ink">Get contacted first</h2></div>
          <p className="mt-1 text-sm text-soft">Verified suppliers are contacted first when a matching request arrives.</p>
          <div className="mt-5 space-y-3">
            {steps.map((step) => (
              <Link key={step.label} href={step.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 transition hover:bg-zinc-50">
                {step.complete ? <CheckCircle size={21} weight="fill" className="text-emerald-600" /> : <Circle size={21} className="text-zinc-300" />}
                <span className={`flex-1 text-sm ${step.complete ? "text-soft line-through" : "font-medium text-ink"}`}>{step.label}</span>
                {!step.complete && <ArrowRight size={14} className="text-muted" />}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
