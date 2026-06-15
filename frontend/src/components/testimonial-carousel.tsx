"use client";

import { Star, Quotes } from "@phosphor-icons/react";
import { Carousel } from "./carousel";

const testimonials = [
  {
    quote: "Bali-Can handled our entire equipment procurement for a refinery project. From sourcing to delivery and installation — seamless process, professional team.",
    author: "Emeka Okonkwo",
    role: "Operations Director, Meridian Energy",
    rating: 5,
  },
  {
    quote: "The credit terms were a game-changer for our cash flow. We were able to equip two new production lines without upfront payment strain. Highly recommend.",
    author: "Folake Adeyemi",
    role: "CEO, Adeyemi Manufacturing",
    rating: 5,
  },
  {
    quote: "We submit RFQs regularly and always get competitive pricing within hours. Their product catalog breadth is unmatched in the Ghanaian industrial space.",
    author: "Chidi Nwosu",
    role: "Procurement Lead, Tema Industrial Area",
    rating: 5,
  },
  {
    quote: "Installation team arrived on time, completed the setup in one day, and walked us through everything. First-class service from start to finish.",
    author: "Ahmed Bello",
    role: "Plant Manager, Northern Steel",
    rating: 5,
  },
  {
    quote: "Having a dedicated account manager who understands our operation makes everything easier. Reordering stock takes minutes, not days.",
    author: "Grace Okafor",
    role: "Supply Chain Head, West Africa Chemicals",
    rating: 4,
  },
];

export default function TestimonialCarousel() {
  return (
    <Carousel
      options={{ align: "center", loop: true, dragFree: true }}
      autoplay
      autoplayInterval={5000}
      showArrows
      showDots
    >
      {testimonials.map((t, i) => (
        <div key={i} className="min-w-0 flex-[0_0_100%] sm:flex-[0_0_50%] lg:flex-[0_0_33.33%] pl-6 first:pl-0">
          <div className="card relative flex h-full flex-col p-8">
            <Quotes size={28} className="text-accent/20" weight="fill" />
            <p className="mt-2 flex-1 text-sm leading-relaxed text-soft">&ldquo;{t.quote}&rdquo;</p>
            <div className="mt-6 flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, j) => (
                <Star key={j} size={14} weight={j < t.rating ? "fill" : "regular"} className={j < t.rating ? "text-amber-400" : "text-zinc-200"} />
              ))}
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-ink">{t.author}</p>
              <p className="text-xs text-muted">{t.role}</p>
            </div>
          </div>
        </div>
      ))}
    </Carousel>
  );
}
