import type { LucideIcon } from "lucide-react";

/** One number on the dashboard. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn";
}) {
  const tones = {
    default: "bg-brand-tint text-brand",
    good: "bg-green-50 text-green-600",
    warn: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-gray-500">{label}</p>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="tnum mt-2 text-[26px] font-bold leading-none text-ink">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-gray-500">{hint}</p>}
    </div>
  );
}
