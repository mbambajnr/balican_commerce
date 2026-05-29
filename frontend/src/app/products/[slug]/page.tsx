import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import ProductClient from "./product-client";
import ProductMediaGallery from "@/components/ProductMediaGallery";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

async function getProduct(slug: string) {
  try {
    const res = await fetch(`${API}/products/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.product;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product Not Found — Bali-Can Limited" };
  const title = product.seo_title || `${product.name} — Bali-Can Limited`;
  const description = product.seo_description || product.description?.slice(0, 160) || "";
  const image = product.primary_image?.url || product.images?.[0]?.url || product.images_list?.[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title: product.seo_title || product.name,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: product.seo_title || product.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const imageUrl = product.primary_image?.url || product.images?.[0]?.url || product.images_list?.[0]?.url || undefined;

  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
    { "@type": "ListItem", position: 2, name: "Products", item: `${siteUrl}/products` },
  ];
  if (product.category_name) {
    const catItem: any = {
      "@type": "ListItem", position: 3, name: product.category_name,
    };
    if (product.category_slug) catItem.item = `${siteUrl}/products?category=${product.category_slug}`;
    breadcrumbItems.push(catItem);
  }
  breadcrumbItems.push({
    "@type": "ListItem", position: breadcrumbItems.length + 1, name: product.name, item: `${siteUrl}/products/${slug}`,
  });

  const productUrl = `${siteUrl}/products/${slug}`;
  const productSchema: Record<string, unknown> = {
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: product.description,
    image: imageUrl,
    sku: product.sku || product.slug,
    mpn: product.sku || product.slug,
    url: productUrl,
    category: product.category_name || undefined,
    itemCondition: "https://schema.org/NewCondition",
  };

  if (product.brand) {
    productSchema.brand = { "@type": "Brand", name: product.brand };
  }

  if (product.category_name) {
    productSchema.category = product.category_name;
  }

  if (product.price !== null && product.price !== undefined) {
    productSchema.offers = {
      "@type": "Offer",
      url: productUrl,
      price: Number(product.price).toFixed(2),
      priceCurrency: "GHS",
      availability: product.stock_status === "in_stock"
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    };
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      productSchema,
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/></svg>
          Back to Products
        </Link>

        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li><Link href="/products" className="hover:text-ink transition-colors">Products</Link></li>
            {product.category_name && product.category_slug && (
              <>
                <li>/</li>
                <li><Link href={`/products?category=${product.category_slug}`} className="hover:text-ink transition-colors">{product.category_name}</Link></li>
              </>
            )}
            <li>/</li>
            <li className="text-ink font-medium truncate max-w-[200px]">{product.name}</li>
          </ol>
        </nav>

        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <ProductMediaGallery media={product.media || []} productName={product.name} />

          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wider">{product.category_name}</p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-ink">{product.name}</h1>
            {product.price !== null && product.price !== undefined ? (
              <>
                <p className="mt-3 text-3xl font-semibold text-accent">GH₵{Number(product.price).toLocaleString()}</p>
                {product.compare_price && (
                  <p className="mt-1 text-sm text-muted line-through">GH₵{Number(product.compare_price).toLocaleString()}</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-lg font-medium text-muted">Request Quote</p>
            )}
            <span className={`badge mt-4 ${product.stock_status === "in_stock" ? "badge-green" : "badge-red"}`}>
              {product.stock_status === "in_stock" ? "In Stock" : "Out of Stock"}
            </span>

            {product.description && (
              <p className="mt-6 text-sm leading-relaxed text-soft">{product.description}</p>
            )}

            {product.specs && Object.keys(product.specs).length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Specifications</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(product.specs).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-muted">{key}:</span>
                      <span className="text-soft">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ProductClient product={product} />

            {/* Resources — internal linking */}
            <div className="mt-8 rounded-xl border border-border bg-surface/50 p-5">
              <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Resources</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/rfq-guide" className="text-xs text-accent hover:text-accent-bold underline underline-offset-2">How to Request a Quote</Link>
                <span className="text-xs text-muted">·</span>
                <Link href="/shipping-policy" className="text-xs text-accent hover:text-accent-bold underline underline-offset-2">Shipping Policy</Link>
                <span className="text-xs text-muted">·</span>
                <Link href="/returns-policy" className="text-xs text-accent hover:text-accent-bold underline underline-offset-2">Returns &amp; Refunds</Link>
                <span className="text-xs text-muted">·</span>
                <Link href="/contact" className="text-xs text-accent hover:text-accent-bold underline underline-offset-2">Contact Support</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
