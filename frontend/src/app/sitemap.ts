import type { MetadataRoute } from "next";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE}/products`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${BASE}/rfq/new`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 },
    { url: `${BASE}/booking`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.6 },
    { url: `${BASE}/b2b-procurement`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 },
    { url: `${BASE}/rfq-guide`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.6 },
    { url: `${BASE}/shipping-policy`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${BASE}/returns-policy`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${BASE}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: new Date(), changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${BASE}/auth/login`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE}/auth/register`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.5 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  try {
    const [prodRes, catRes] = await Promise.all([
      fetch(`${API}/products?limit=500`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${API}/products/categories/all`, { signal: AbortSignal.timeout(10000) }),
    ]);
    if (prodRes.ok) {
      const data = await prodRes.json();
      productPages = (data.products || []).map((p: any) => ({
        url: `${BASE}/products/${p.slug}`,
        lastModified: new Date(p.updated_at || p.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
    if (catRes.ok) {
      const data = await catRes.json();
      const flatten = (cats: any[]): any[] => {
        const result: any[] = [];
        for (const c of cats) {
          result.push(c);
          if (c.children?.length) result.push(...flatten(c.children));
        }
        return result;
      };
      categoryPages = flatten(data.categories || []).map((c: any) => ({
        url: `${BASE}/products?category=${c.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }
  } catch {}

  return [...staticPages, ...productPages, ...categoryPages];
}
