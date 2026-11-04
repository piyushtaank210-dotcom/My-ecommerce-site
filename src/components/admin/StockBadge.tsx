import { STOCK_LEVEL_LABEL, STOCK_LEVEL_TONE, type StockLevel } from "@/lib/stock";

/** The pill a stock level is shown in. */
export function StockBadge({
  level,
  className = "",
}: {
  level: StockLevel;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${STOCK_LEVEL_TONE[level]} ${className}`}
    >
      {STOCK_LEVEL_LABEL[level]}
    </span>
  );
}
