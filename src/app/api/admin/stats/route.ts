import { getAdminStats } from "@/lib/admin";
import { json, requireApiPermission } from "@/lib/api";

/** GET /api/admin/stats — the dashboard headline numbers. */
export async function GET() {
  const guard = await requireApiPermission("dashboard.view");
  if ("error" in guard) return guard.error;

  return json(getAdminStats());
}
