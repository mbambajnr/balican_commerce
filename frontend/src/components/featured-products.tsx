"use client";

import Link from "next/link";
import { Cube } from "@phosphor-icons/react";
import { Carousel } from "./carousel";

export default function FeaturedProductCarousel({ products }: { products: any[] }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Cube size={40} className="text-muted" weight="light" />
        <p className="text-sm text-soft">Products coming soon</p>
      </div>
    );
  }

  return (
    <Carousel
      options={{ align: "start", dragFree: true, loop: products.length > 3 }}
      autoplay={false}
      showArrows
      showDots={false}
      className="-mx-1 px-1"
    >
      {products.map((p: any) => (
        <div key={p.id} className="min-w-0 flex-[0_0_85%] sm:flex-[0_0_45%] lg:flex-[0_0_28%] xl:flex-[0_0_23%] pl-5 first:pl-0">
          <Link href={`/products/${p.slug}`} className="group card block overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="aspect-[4/3] bg-zinc-100 flex items-center justify-center overflow-hidden">
              {p.images?.[0] ? (
                <img src={p.images[0]} alt={p.name} width={400} height={300} loading="lazy" className="h-full w-full object-cover transition-all duration-500 group-hover:scale-105" />
              ) : (
                <Cube size={40} className="text-zinc-300" weight="light" />
              )}
            </div>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{p.category_name}</p>
              <h3 className="mt-1 font-display text-base font-semibold text-ink line-clamp-1">{p.name}</h3>
              {p.price !== null && p.price !== undefined ? (
                <p className="mt-2 text-lg font-semibold text-accent">GH₵{Number(p.price).toLocaleString()}</p>
              ) : (
                <p className="mt-2 text-sm font-medium text-muted">Request Quote</p>
              )}
              <span className={`badge mt-2 ${p.stock_status === "in_stock" ? "badge-green" : "badge-red"}`}>
                {p.stock_status === "in_stock" ? "In Stock" : "Out of Stock"}
              </span>
            </div>
          </Link>
        </div>
      ))}
    </Carousel>
  );
}
