import { json, requireApiPermission } from "@/lib/api";
import {
  inventorySummary,
  listStockBuckets,
  pendingStockChecks,
} from "@/lib/inventory";

/**
 * GET /api/admin/inventory — the stock picture.
 *
 * Every line the store counts, with its own threshold and its own level,
 * plus the returns that are waiting to be looked at.
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("inventory.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const level = url.searchParams.get("level") ?? "all";

  return json({
    summary: (await inventorySummary()),
    buckets: (await listStockBuckets({ q, level })),
    pendingChecks: (await pendingStockChecks()),
  });
}
