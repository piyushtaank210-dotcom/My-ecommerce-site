import Link from "next/link";
import Image from "next/image";
import { Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { getCategories, getProducts } from "@/lib/queries";

const PROMISES = [
  {
    Icon: ShieldCheck,
    title: "Genuine hardware only",
    body: "Authorised distributor units with full Indian warranty.",
  },
  {
    Icon: Truck,
    title: "Fast delivery",
    body: "Dispatched within 24 hours, 2–4 working days.",
  },
  {
    Icon: RotateCcw,
    title: "5-day replacement",
    body: "Dead on arrival? We replace it, no restocking fee.",
  },
];

export function Footer() {
  // The categories the shop actually has something in. A category that is
  // empty — one the store is getting ready for — is not a link yet.
  const stocked = new Set(
    getProducts().map((p) => p.category_slug).filter(Boolean)
  );
  const categories = getCategories().filter((c) => stocked.has(c.slug));

  return (
    <footer className="mt-20 border-t border-gray-200 bg-gray-50">
      <div className="container-x">
        <div className="grid gap-8 border-b border-gray-200 py-10 sm:grid-cols-3">
          {PROMISES.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-gray-500">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <Link href="/" className="inline-block" aria-label="ConsoleSeller Home">
              <Image
                src="/logo.png"
                alt="ConsoleSeller"
                width={170}
                height={33}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-gray-500">
              Consoles and controllers. Genuine stock, honest
              prices.
            </p>
          </div>

          <FooterLinks
            title="Shop"
            links={[
              { label: "Shop all products", href: "/shop" },
              ...categories.map((c) => ({
                label: c.name,
                href: `/category/${c.slug}`,
              })),
            ]}
          />

          <FooterLinks
            title="Company"
            links={[
              { label: "Home", href: "/" },
              { label: "About Us", href: "/about" },
              { label: "Contact Us", href: "/contact" },
            ]}
          />

          <FooterLinks
            title="Account"
            links={[
              { label: "Sign in", href: "/login" },
              { label: "Create account", href: "/register" },
              { label: "My orders", href: "/account" },
              { label: "Cart", href: "/cart" },
            ]}
          />

          <FooterLinks
            title="Customer Support"
            links={[
              { label: "Privacy Policy", href: "/privacy-policy" },
              { label: "Terms of Service", href: "/terms-of-service" },
              { label: "Refund & Return Policy", href: "/refund-policy" },
              { label: "Contact Us", href: "/contact" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 py-6 text-[12.5px] text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ConsoleSeller. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-ink">
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-[13.5px] text-gray-500 transition-colors hover:text-brand"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
