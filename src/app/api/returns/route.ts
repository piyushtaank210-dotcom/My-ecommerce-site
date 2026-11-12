import { NextResponse } from "next/server";
import { fail, json, requireApiUser } from "@/lib/api";
import { getReturnRequestsForUser } from "@/lib/returns";
import { submitReturnRequest } from "@/lib/return-submit";
import type { ReturnType } from "@/lib/return-status";

/**
 * GET /api/returns — the signed-in customer's own requests.
 *
 * Nobody else's requests are in it: the list is drawn from the account
 * that is signed in, not from anything the request body says.
 */
export async function GET() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const requests = await getReturnRequestsForUser(guard.user.id);
  return json({
    requests: requests.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      type: r.type,
      status: r.status,
      reason: r.reason,
      customer_notes: r.customer_notes,
      delivery_date: r.delivery_date,
      serial_number: r.serial_number,
      created_at: r.created_at,
      updated_at: r.updated_at,
      items: r.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        product_slug: it.product_slug,
      })),
      evidence: r.images.map((im) => ({
        id: im.id,
        kind: im.kind,
        evidence_kind: im.evidence_kind,
        original_name: im.original_name,
        uploaded_at: im.created_at,
        version: im.version,
        url: `/api/returns/${r.id}/evidence/${im.id}`,
      })),
    })),
  });
}

/**
 * POST /api/returns — raise a return or replacement request.
 *
 * The order is checked against the account that is signed in, the
 * delivery date is checked against the order's own record of it, and
 * the claim is refused if the information the chosen reason needs is
 * missing. Files are sent separately, to /api/returns/evidence, and
 * are attached by their ids.
 */
export async function POST(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  let body: {
    orderId?: string;
    type?: string;
    reason?: string;
    customerNotes?: string;
    serialNumber?: string;
    missingAccessories?: string;
    sealedState?: string;
    deliveryDate?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    evidenceExcused?: string;
    uploadIds?: string[];
    items?: {
      orderItemId: number;
      productSlug: string;
      variantId: string | null;
      name: string;
      price: number;
      quantity: number;
    }[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  if (!body.orderId) return fail("The order is required.", 400);

  const result = await submitReturnRequest(
    {
      orderId: body.orderId,
      type: (body.type ?? "return") as ReturnType,
      reason: body.reason ?? "",
      customerNotes: body.customerNotes ?? "",
      items: body.items ?? [],
      serialNumber: body.serialNumber ?? "",
      missingAccessories: body.missingAccessories ?? "",
      sealedState: body.sealedState ?? "",
      deliveryDate: body.deliveryDate ?? "",
      contactName: body.contactName ?? "",
      contactEmail: body.contactEmail ?? "",
      contactPhone: body.contactPhone ?? "",
      evidenceExcused: body.evidenceExcused ?? "",
      uploadIds: body.uploadIds ?? [],
    },
    { id: guard.user.id, email: guard.user.email }
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, errors: result.errors },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: true, returnId: result.returnId },
    { status: 201 }
  );
}
