import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";

/**
 * Split layout for the sign-in / register pages: form on the left,
 * a brand panel on the right.
 */
export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
  points,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  points: { title: string; body: string }[];
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-8 inline-block" aria-label="ConsoleSeller Home">
            <Image
              src="/logo.png"
              alt="ConsoleSeller"
              width={190}
              height={37}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>

          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight text-ink sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
            {subtitle}
          </p>

          <div className="mt-8">{children}</div>
        </div>
      </div>

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 90% at 85% 8%, #0071c5 0%, transparent 58%), radial-gradient(90% 70% at 10% 100%, #0a3d63 0%, transparent 60%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 xl:px-20">
          <h2 className="max-w-md text-[34px] font-bold leading-[1.15] text-white xl:text-[40px]">
            Every console and controller, from one store.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
            Consoles and controllers — genuine hardware with Indian warranty,
            ready to ship the same day.
          </p>

          <ul className="mt-10 space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/12 text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold text-white">
                    {p.title}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-relaxed text-white/60">
                    {p.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-12 flex items-center gap-3 border-t border-white/10 pt-6">
            <span className="text-[13px] text-white/50">
              © {new Date().getFullYear()} ConsoleSeller
            </span>
            <span className="text-white/20">·</span>
            <span className="text-[13px] text-white/50">Demo store</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const AUTH_POINTS = [
  {
    title: "Genuine hardware only",
    body: "Authorised distributor units, sealed, with full Indian warranty.",
  },
  {
    title: "Same-day dispatch",
    body: "Orders placed before 4pm leave our warehouse the same working day.",
  },
  {
    title: "7-day replacement",
    body: "Dead on arrival? We replace it, with no restocking fee.",
  },
];
