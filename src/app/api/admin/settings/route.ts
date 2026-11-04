import { json, fail, requireApiPermission } from "@/lib/api";
import {
  getBackorderPolicy,
  setBackorderPolicy,
  getReturnWindowDays,
  setReturnWindowDays,
} from "@/lib/settings";
import { BACKORDER_POLICIES } from "@/lib/variations";

/**
 * GET /api/admin/settings — the store's own settings.
 */
export async function GET() {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  return json({
    backorderPolicy: getBackorderPolicy(),
    returnWindowDays: getReturnWindowDays(),
  });
}

/**
 * PATCH /api/admin/settings — change settings.
 *
 * Body: `{"backorderPolicy":"none"|"allow", "returnWindowDays": 5}`.
 */
export async function PATCH(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let body: { backorderPolicy?: unknown; returnWindowDays?: unknown };
  try {
    body = (await request.json()) as {
      backorderPolicy?: unknown;
      returnWindowDays?: unknown;
    };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (body.backorderPolicy !== undefined) {
    const policy = String(body.backorderPolicy ?? "").trim();
    if (!(BACKORDER_POLICIES as readonly string[]).includes(policy)) {
      return fail("Pick a valid policy.", 400);
    }
    setBackorderPolicy(policy as "none" | "allow");
  }

  if (body.returnWindowDays !== undefined) {
    const days = Number(body.returnWindowDays);
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      return fail("Return window must be between 1 and 60 days.", 400);
    }
    setReturnWindowDays(days);
  }

  return json({
    backorderPolicy: getBackorderPolicy(),
    returnWindowDays: getReturnWindowDays(),
  });
}
