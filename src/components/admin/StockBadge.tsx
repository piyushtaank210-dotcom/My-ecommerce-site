import { STOCK_LEVEL_LABEL, type StockLevel } from "@/lib/stock";
import { Badge } from "./ui/Badge";
import { STOCK_LEVEL_TONE } from "@/lib/status-tone";

/** The pill a stock level is shown in. */
export function StockBadge({
  level,
  className = "",
}: {
  level: StockLevel;
  className?: string;
}) {
  return (
    <Badge tone={STOCK_LEVEL_TONE[level] ?? "neutral"} className={className}>
      {STOCK_LEVEL_LABEL[level]}
    </Badge>
  );
}
