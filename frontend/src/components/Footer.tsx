import Link from "next/link";
import { Envelope, Phone, MapPin, ArrowRight, ShoppingBag, FileText, Wrench, BuildingOffice, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-navy-dark">
      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white text-xs font-bold tracking-tight">BC</div>
              <span className="font-display text-base font-semibold tracking-tight text-white">Bali-Can Limited</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400 max-w-xs">
              End-to-end industrial product sourcing and service delivery across Ghana. HVAC, electricals, solar, appliances, and B2B procurement.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-500">Quick Links</h3>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Products", href: "/products", icon: ShoppingBag },
                { label: "Request a Quote", href: "/rfq/new", icon: FileText },
                { label: "Book Installation", href: "/booking", icon: Wrench },
                { label: "B2B Procurement", href: "/b2b-procurement", icon: BuildingOffice },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="group flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
                    <link.icon size={14} weight="duotone" className="text-zinc-600 group-hover:text-accent transition-colors" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-500">Contact</h3>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <MapPin size={14} weight="duotone" className="text-zinc-600 shrink-0 mt-0.5" />
                <span>Accra, Greater Accra<br />Ghana</span>
              </li>
              <li>
                <a href="tel:+233XXX XXX XXX" className="group flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
                  <Phone size={14} weight="duotone" className="text-zinc-600 group-hover:text-accent transition-colors shrink-0" />
                  +233 XXX XXX XXX
                </a>
              </li>
              <li>
                <a href="mailto:info@balican.com" className="group flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
                  <Envelope size={14} weight="duotone" className="text-zinc-600 group-hover:text-accent transition-colors shrink-0" />
                  info@balican.com
                </a>
              </li>
            </ul>
          </div>

          {/* Policies & CTA */}
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-500">Policies</h3>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Shipping Policy", href: "/shipping-policy" },
                { label: "Returns & Refunds", href: "/returns-policy" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "RFQ Guide", href: "/rfq-guide" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-zinc-400 transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-all hover:bg-accent-bold active:scale-[0.97]"
              >
                Register Your Company <ArrowRight size={12} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} Bali-Can Limited. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} weight="duotone" />
                Secure transactions
              </span>
              <span className="hidden sm:inline">&middot;</span>
              <span>Industrial Supply &amp; Services, Ghana</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
