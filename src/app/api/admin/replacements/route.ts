import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import { pageParams, paged } from "@/lib/api";
import { countReplacements, listReplacements } from "@/lib/returns-records";

/**
 * GET /api/admin/replacements — every replacement shipment, searchable.
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const query = {
    q: url.searchParams.get("q")?.trim() || undefined,
    status: url.searchParams.get("status") || undefined,
    from: url.searchParams.get("from")?.trim() || undefined,
    to: url.searchParams.get("to")?.trim() || undefined,
    limit,
    offset,
  };

  const [rows, total] = await Promise.all([
    listReplacements(query),
    countReplacements(query),
  ]);

  return json(paged(rows, total, page, limit));
}
