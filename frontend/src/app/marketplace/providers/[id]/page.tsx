"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Storefront, Star, SealCheck, MapPin, CreditCard, ArrowLeft,
  ShoppingBag, Wrench, PaperPlaneTilt,
} from "@phosphor-icons/react/dist/ssr";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";

export default function MarketplaceProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [provider, setProvider] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"products" | "services">("products");

  useEffect(() => {
    api.getMarketplaceProvider(id)
      .then((res) => {
        setProvider(res.provider);
        setProducts(res.products || []);
        setServices(res.services || []);
      })
      .catch(() => { setProvider(null); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <Storefront size={44} className="mx-auto text-muted" weight="light" />
        <p className="mt-4 text-sm text-soft">Provider not found</p>
        <Link href="/marketplace/providers" className="btn btn-sm mt-4">
          <ArrowLeft size={14} weight="bold" /> Back to providers
        </Link>
      </div>
    );
  }

  const providerTypeLabel =
    provider.provider_type === "both"
      ? "Supplier & Service Provider"
      : provider.provider_type?.replace(/_/g, " ") || "Provider";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href="/marketplace/providers"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft size={14} weight="bold" /> Back to providers
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent text-3xl font-bold">
            {provider.name?.[0] || "P"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                {provider.name}
              </h1>
              {provider.verification_badge && (
                <SealCheck size={20} className="text-accent" weight="fill" />
              )}
              <span className="badge badge-blue capitalize">{providerTypeLabel}</span>
              {provider.credit_tier && provider.credit_tier !== "unrated" && provider.credit_tier !== "basic" && (
                <span className={`badge ${
                  provider.credit_tier === "premium" ? "badge-gold" : "badge-green"
                } capitalize`}>
                  {provider.credit_tier === "premium" ? "Premium Supplier" : "Standard Supplier"}
                </span>
              )}
            </div>

            {provider.description && (
              <p className="mt-3 text-sm leading-relaxed text-soft max-w-2xl">
                {provider.description}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
              {provider.rating_average > 0 && (
                <span className="flex items-center gap-1">
                  <Star size={14} weight="fill" className="text-amber-500" />
                  {Number(provider.rating_average).toFixed(1)} Rating
                </span>
              )}
              {provider.years_experience > 0 && (
                <span>{provider.years_experience} years experience</span>
              )}
              {provider.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {provider.city}
                  {provider.region ? `, ${provider.region}` : ""}
                </span>
              )}
            </div>

            {provider.certifications?.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted">Certifications:</span>
                {provider.certifications.map((cert: string, i: number) => (
                  <span key={i} className="badge badge-navy text-[10px]">{cert}</span>
                ))}
              </div>
            )}

            {provider.credit_available && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold-soft px-3 py-1.5 text-xs font-medium text-gold-bold">
                <CreditCard size={14} weight="fill" />
                Credit available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Quote CTA */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Need products or services from this provider?</p>
          <p className="mt-0.5 text-xs text-muted">Submit a procurement request and get quotes directly.</p>
        </div>
        <Link
          href={`/procurement/requests/new?providerId=${provider.id}`}
          className="btn btn-sm gap-1.5 shrink-0"
        >
          <PaperPlaneTilt size={14} weight="bold" />
          Request Quote
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-border">
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "products"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <ShoppingBag size={16} weight={activeTab === "products" ? "fill" : "regular"} />
            Products{products.length > 0 ? ` (${products.length})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("services")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "services"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Wrench size={16} weight={activeTab === "services" ? "fill" : "regular"} />
            Services{services.length > 0 ? ` (${services.length})` : ""}
          </button>
        </div>
      </div>

      {/* Products Tab */}
      {activeTab === "products" && (
        <>
          {products.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <ShoppingBag size={40} className="text-muted" weight="light" />
              <p className="text-sm text-soft">No products listed yet</p>
              <Link href="/marketplace/providers" className="btn btn-sm">
                Browse other providers
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product: any) => (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className="card overflow-hidden transition hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="aspect-[4/3] bg-zinc-100 flex items-center justify-center text-muted">
                    {product.primary_image?.url ? (
                      <img
                        src={product.primary_image.url}
                        alt={product.primary_image.alt_text || product.name}
                        width={400}
                        height={300}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ShoppingBag size={28} weight="light" />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-sm font-semibold text-ink line-clamp-1">
                      {product.name}
                    </h3>
                    {product.price !== null && product.price !== undefined ? (
                      <p className="mt-1.5 text-base font-semibold text-accent">
                        GH₵{Number(product.price).toLocaleString()}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs font-medium text-muted">Request Quote</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Services Tab */}
      {activeTab === "services" && (
        <>
          {services.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <Wrench size={40} className="text-muted" weight="light" />
              <p className="text-sm text-soft">No services listed yet</p>
              <Link href="/marketplace/providers" className="btn btn-sm">
                Browse other providers
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service: any) => (
                <Link
                  key={service.id}
                  href={service.slug ? `/marketplace/services/slug/${service.slug}` : "#"}
                  className="card p-5 transition hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Wrench size={20} weight="duotone" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold text-ink line-clamp-1">
                        {service.name}
                      </h3>
                      {service.pricing_model && (
                        <p className="text-xs text-soft capitalize">
                          {service.pricing_model.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                  </div>
                  {service.description && (
                    <p className="mt-3 text-xs text-soft line-clamp-2 leading-relaxed">
                      {service.description}
                    </p>
                  )}
                  {service.starting_price != null && (
                    <p className="mt-3 text-sm font-semibold text-accent">
                      From GH₵{Number(service.starting_price).toLocaleString()}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
