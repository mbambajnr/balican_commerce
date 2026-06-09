"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MagnifyingGlass, Funnel, Cube, PlayCircle, Check } from "@phosphor-icons/react";

function ProductSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[4/3] skeleton" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-20 skeleton" />
        <div className="h-5 w-3/4 skeleton" />
        <div className="h-5 w-1/3 skeleton" />
      </div>
    </div>
  );
}

export default function ProductListingClient() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getCategories().then((res) => setCategories(res.categories)).catch(() => {});
  }, []);

  // Read category from URL query param on mount (e.g. ?category=hvac)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const catFromUrl = params.get("category");
    if (catFromUrl) {
      setCategory(catFromUrl);
    }
  }, []);

  const [subcategory, setSubcategory] = useState("");

  useEffect(() => {
    setLoading(true);
    const params: any = {};
    if (search) params.search = search;
    if (subcategory) {
      params.subcategory = subcategory;
    } else if (category) {
      params.category = category;
    }
    api.getProducts(params)
      .then((res) => {
        setProducts(res.products);
        if (search) api.trackSearch(search, res.pagination.total).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, category, subcategory]);

  const handleCategoryChange = (slug: string) => {
    setCategory(slug);
    setSubcategory("");
  };

  const handleSubcategoryChange = (slug: string) => {
    setSubcategory(slug);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const requestQuote = () => {
    const ids = Array.from(selectedIds);
    router.push(`/rfq/new?products=${ids.join(",")}`);
  };

  const findCategory = (cats: any[], slug: string): any => {
    for (const c of cats) {
      if (c.slug === slug) return c;
      if (c.children?.length) {
        const found = findCategory(c.children, slug);
        if (found) return found;
      }
    }
    return null;
  };

  const [selectedCategoryData, setSelectedCategoryData] = useState<any>(null);

  useEffect(() => {
    if (category) {
      const found = findCategory(categories, category);
      setSelectedCategoryData(found || null);
    } else {
      setSelectedCategoryData(null);
    }
  }, [category, categories]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          {selectedCategoryData?.seo_title || (category ? `${selectedCategoryData?.name || "Products"} — Bali-Can Limited` : "Products")}
        </h1>
        <p className="text-soft">
          {selectedCategoryData?.seo_description || selectedCategoryData?.intro_text || "Browse our catalog of industrial solutions"}
        </p>
      </div>

      {selectedCategoryData?.intro_text && selectedCategoryData.intro_text !== selectedCategoryData?.seo_description && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed text-soft">
          {selectedCategoryData.intro_text}
        </div>
      )}

      {selectedCategoryData?.children?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs font-medium text-muted self-center">Subcategories:</span>
          {selectedCategoryData.children.map((child: any) => (
            <button
              key={child.id}
              onClick={() => handleSubcategoryChange(child.slug)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                subcategory === child.slug
                  ? "bg-accent text-white"
                  : "bg-surface text-soft hover:bg-border"
              }`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Funnel size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} className="input pl-10 appearance-none">
            <option value="">All Categories</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        {category && (() => {
          const selected = categories.find((c: any) => c.slug === category);
          if (!selected || !selected.children?.length) return null;
          return (
            <div className="relative w-full sm:w-56">
              <select value={subcategory} onChange={(e) => handleSubcategoryChange(e.target.value)} className="input appearance-none">
                <option value="">All {selected.name}</option>
                {selected.children.map((child: any) => (
                  <option key={child.id} value={child.slug}>{child.name}</option>
                ))}
              </select>
            </div>
          );
        })()}
      </div>

      {loading ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <Cube size={40} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No products found</p>
          <button onClick={() => { setSearch(""); setCategory(""); }} className="btn btn-sm">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product: any) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className={`card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 group ${selectedIds.has(product.id) ? "ring-2 ring-accent" : ""}`}
            >
              <div className="aspect-[4/3] bg-zinc-100 flex items-center justify-center text-muted text-sm overflow-hidden relative">
                <div
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelection(product.id); }}
                  className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {selectedIds.has(product.id) ? (
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                      <Check size={14} weight="bold" className="text-white" />
                    </div>
                  ) : null}
                </div>

                {product.primary_image?.url ? (
                  <img src={product.primary_image.url} alt={product.primary_image.alt_text || product.name} width={400} height={300} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Cube size={32} weight="light" />
                )}

                {product.has_video && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <PlayCircle size={24} weight="fill" className="text-[#1848CC]" />
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D4AF37] text-white text-[10px] font-semibold uppercase tracking-wider pointer-events-none shadow-sm">
                      <PlayCircle size={10} weight="fill" />
                      <span>Video</span>
                    </div>

                    <div className="absolute inset-0 bg-navy/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none max-sm:hidden">
                      <div className="flex items-center gap-2 text-white">
                        <PlayCircle size={18} weight="fill" />
                        <span className="text-xs font-medium tracking-wide">Watch product video</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-muted uppercase tracking-wider">{product.category_name}</p>
                <h3 className="mt-1.5 font-display text-base font-semibold text-ink line-clamp-1">{product.name}</h3>
                {product.price !== null && product.price !== undefined ? (
                  <>
                    <p className="mt-2 text-lg font-semibold text-accent">
                      GH₵{Number(product.price).toLocaleString()}
                    </p>
                    {product.compare_price && (
                      <p className="text-xs text-muted line-through">GH₵{Number(product.compare_price).toLocaleString()}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm font-medium text-muted">Request Quote</p>
                )}
                <span className={`badge mt-3 ${product.stock_status === "in_stock" ? "badge-green" : "badge-red"}`}>
                  {product.stock_status === "in_stock" ? "In Stock" : "Out of Stock"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-navy backdrop-blur-md border-t border-navy-dark shadow-lg">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-white/80">{selectedIds.size} product(s) selected</p>
            <div className="flex items-center gap-4">
              <button onClick={clearSelection} className="text-sm text-white/50 hover:text-white/80 transition-colors">Clear selection</button>
              <button onClick={requestQuote} className="btn btn-primary btn-sm">Request Quote</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
