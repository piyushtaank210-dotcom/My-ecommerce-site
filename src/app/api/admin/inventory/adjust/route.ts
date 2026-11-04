import { json, fail, requireApiPermission } from "@/lib/api";
import { adjustStock } from "@/lib/inventory";
import { ADJUST_MODES } from "@/lib/stock";

/**
 * POST /api/admin/inventory/adjust — change a stock level by hand.
 *
 * Body: `{productSlug, variantId?, mode: "set"|"add"|"remove", quantity,
 * reason, note?}`. The reason is required: a change without a reason is
 * not allowed, and stock is never allowed to go below zero.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission("inventory.manage");
  if ("error" in guard) return guard.error;

  let body: {
    productSlug?: unknown;
    variantId?: unknown;
    mode?: unknown;
    quantity?: unknown;
    reason?: unknown;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const productSlug = String(body.productSlug ?? "").trim();
  const variantId = body.variantId ? String(body.variantId).trim() : null;
  const mode = String(body.mode ?? "");
  const quantity = Number(body.quantity);
  const reason = String(body.reason ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;

  if (!productSlug) return fail("Choose a product.", 400);
  if (!(ADJUST_MODES as readonly string[]).includes(mode)) {
    return fail("Pick what the change is.", 400);
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return fail("Enter a whole number of units.", 400);
  }
  if (!reason) return fail("Give a reason for the change.", 400);

  const result = adjustStock({
    productSlug,
    variantId,
    mode: mode as "set" | "add" | "remove",
    quantity,
    reason,
    note,
    userId: guard.user.id,
  });

  if (!result.ok) return fail(result.reason, 409);

  return json({
    ok: true,
    key: result.key,
    previous: result.previous,
    stock: result.stock,
    level: result.level,
  });
}
