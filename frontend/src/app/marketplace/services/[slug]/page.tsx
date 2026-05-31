"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  ArrowLeft, Wrench, Star, SealCheck, MapPin, CurrencyDollar, CreditCard, Clock, Building,
} from "@phosphor-icons/react/dist/ssr";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import EmptyState from "@/components/admin/EmptyState";

export default function ServiceDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [service, setService] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMarketplaceService(slug)
      .then((res) => setService(res.service))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-10"><PageSkeleton /></div>;
  if (!service) return <div className="mx-auto max-w-4xl px-4 py-10"><EmptyState icon="default" title="Service not found" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/marketplace/services" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
        <ArrowLeft size={12} /> Back to Services
      </Link>

      <div className="mt-4 card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Wrench size={28} weight="duotone" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-ink">{service.name}</h1>
            {service.service_type && <p className="text-xs text-soft capitalize mt-0.5">{service.service_type}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {service.starting_price && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <CurrencyDollar size={12} /> From GH₵{Number(service.starting_price).toLocaleString()}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 capitalize">
                {service.pricing_model?.replace(/_/g, " ")}
              </span>
              {service.credit_eligible && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
                  <CreditCard size={12} weight="fill" /> Credit Available
                </span>
              )}
            </div>
          </div>
        </div>

        {service.description && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink">Description</h2>
            <p className="mt-1 text-sm text-soft whitespace-pre-wrap">{service.description}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          {service.estimated_response_time && (
            <div>
              <p className="text-xs text-muted">Est. Response</p>
              <p className="font-medium text-ink flex items-center gap-1"><Clock size={14} /> {service.estimated_response_time}</p>
            </div>
          )}
          {service.minimum_job_value && (
            <div>
              <p className="text-xs text-muted">Min. Job Value</p>
              <p className="font-medium text-ink">GH₵{Number(service.minimum_job_value).toLocaleString()}</p>
            </div>
          )}
          {service.service_areas && service.service_areas.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted">Service Areas</p>
              <p className="font-medium text-ink flex flex-wrap gap-1 mt-0.5">
                {service.service_areas.map((a: string) => (
                  <span key={a} className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{a}</span>
                ))}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Provider card */}
      <div className="mt-4 card p-5">
        <div className="flex items-center gap-3">
          <Link href={`/marketplace/providers/${service.provider_id}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold">
              {service.provider_name?.[0] || "P"}
            </div>
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/marketplace/providers/${service.provider_id}`} className="text-sm font-medium text-ink hover:underline">
              {service.provider_name}
            </Link>
            {service.provider_rating > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted">
                <Star size={11} weight="fill" className="text-amber-500" /> {Number(service.provider_rating).toFixed(1)}
              </p>
            )}
          </div>
          <Link href={`/marketplace/providers/${service.provider_id}`} className="btn btn-sm gap-1">
            <Building size={14} /> View Provider
          </Link>
        </div>
      </div>
    </div>
  );
}
