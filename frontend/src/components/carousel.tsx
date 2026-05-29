"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

type CarouselOptions = {
  loop?: boolean;
  align?: "start" | "center" | "end";
  skipSnaps?: boolean;
  dragFree?: boolean;
};

export function Carousel({
  children,
  options = {},
  showArrows = true,
  showDots = true,
  autoplay = false,
  autoplayInterval = 4000,
  className = "",
}: {
  children: React.ReactNode;
  options?: CarouselOptions;
  showArrows?: boolean;
  showDots?: boolean;
  autoplay?: boolean;
  autoplayInterval?: number;
  className?: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: options.loop ?? true,
    align: options.align ?? "start",
    skipSnaps: options.skipSnaps ?? true,
    dragFree: options.dragFree ?? false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!autoplay || !emblaApi) return;
    const timer = setInterval(() => {
      if (emblaApi.canScrollNext()) emblaApi.scrollNext();
      else emblaApi.scrollTo(0);
    }, autoplayInterval);
    return () => clearInterval(timer);
  }, [autoplay, autoplayInterval, emblaApi]);

  return (
    <div className={`relative ${className}`}>
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">{children}</div>
      </div>

      {showArrows && (
        <>
          <button
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute -left-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-white p-2.5 text-ink shadow-sm transition-all hover:bg-zinc-50 active:scale-90 md:flex"
            aria-label="Previous"
          >
            <CaretLeft size={18} weight="bold" />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-white p-2.5 text-ink shadow-sm transition-all hover:bg-zinc-50 active:scale-90 md:flex"
            aria-label="Next"
          >
            <CaretRight size={18} weight="bold" />
          </button>
        </>
      )}

      {showDots && scrollSnaps.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {scrollSnaps.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === selectedIndex ? "w-6 bg-accent" : "w-2 bg-zinc-300 hover:bg-zinc-400"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
