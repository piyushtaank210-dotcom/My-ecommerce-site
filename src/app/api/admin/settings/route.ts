import { json, fail, requireApiPermission } from "@/lib/api";
import {
  getBackorderPolicy,
  setBackorderPolicy,
  getReturnPolicy,
  setReturnPolicyDescription,
  setReturnPhotoRequired,
  setReturnPickupRequired,
  setReturnsEnabled,
  setReturnWindowDays,
} from "@/lib/settings";
import { BACKORDER_POLICIES } from "@/lib/variations";

/**
 * GET /api/admin/settings — the store's own settings.
 */
export async function GET() {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  return json({
    backorderPolicy: await getBackorderPolicy(),
    ...(await getReturnPolicy()),
  });
}

/**
 * PATCH /api/admin/settings — change settings.
 *
 * Body:
 *   {"backorderPolicy":"none"|"allow", "returnWindowDays":7,
 *    "returnsEnabled":true, "returnPolicyDescription":"…",
 *    "returnPhotoRequired":true, "returnPickupRequired":true}
 *
 * The backorder policy is a catalogue decision and needs
 * `catalog.manage`. The return policy belongs to the returns desk and
 * needs `returns.manage`, so whoever works the queue can set the
 * window and the evidence the shop asks for.
 */
export async function PATCH(request: Request) {
  const guard = await requireApiPermission("returns.view");
  if ("error" in guard) return guard.error;

  let body: {
    backorderPolicy?: unknown;
    returnWindowDays?: unknown;
    returnsEnabled?: unknown;
    returnPolicyDescription?: unknown;
    returnPhotoRequired?: unknown;
    returnPickupRequired?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  // The backorder policy is a catalogue decision, so it keeps its own
  // permission.
  if (body.backorderPolicy !== undefined) {
    const canManage = await hasPermission("catalog.manage");
    if (!canManage) {
      return fail("Your role does not allow changing the backorder policy.", 403);
    }
    const policy = String(body.backorderPolicy ?? "").trim();
    if (!(BACKORDER_POLICIES as readonly string[]).includes(policy)) {
      return fail("Pick a valid policy.", 400);
    }
    await setBackorderPolicy(policy as "none" | "allow");
  }

  // Everything from here on is the return policy.
  const canManageReturns = await hasPermission("returns.manage");
  if (!canManageReturns) {
    return fail("Your role does not allow changing the return policy.", 403);
  }

  if (body.returnWindowDays !== undefined) {
    const days = Number(body.returnWindowDays);
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      return fail("Return window must be between 1 and 60 days.", 400);
    }
    await setReturnWindowDays(days);
  }

  if (body.returnsEnabled !== undefined) {
    await setReturnsEnabled(Boolean(body.returnsEnabled));
  }

  if (body.returnPolicyDescription !== undefined) {
    const text = String(body.returnPolicyDescription ?? "").trim();
    if (text.length > 1000) {
      return fail("The policy description may be up to 1000 characters.", 400);
    }
    await setReturnPolicyDescription(text);
  }

  if (body.returnPhotoRequired !== undefined) {
    await setReturnPhotoRequired(Boolean(body.returnPhotoRequired));
  }

  if (body.returnPickupRequired !== undefined) {
    await setReturnPickupRequired(Boolean(body.returnPickupRequired));
  }

  return json({
    backorderPolicy: await getBackorderPolicy(),
    ...(await getReturnPolicy()),
  });
}

/**
 * Whether the signed-in member of staff holds a permission.
 *
 * The API guard has already checked that somebody is signed in, so this
 * only asks the second question — what they are allowed to change.
 */
async function hasPermission(permission: string): Promise<boolean> {
  const { getCurrentUser } = await import("@/lib/auth");
  const { can } = await import("@/lib/roles");
  const user = await getCurrentUser();
  if (!user) return false;
  return can(user.role, permission as never);
}
