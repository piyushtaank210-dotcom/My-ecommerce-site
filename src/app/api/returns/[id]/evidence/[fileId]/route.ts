import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { contentTypeFor, readEvidence } from "@/lib/evidence";

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");

/**
 * GET /api/returns/[id]/evidence/[fileId]
 *
 * One piece of evidence — a photograph or a video.
 *
 * The file is not served from the public folder and no URL points at it
 * directly. It is fetched through here, and the answer depends on who
 * is asking: a member of the back office, or the customer the claim
 * belongs to. Anybody else is refused.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to see this evidence." },
      { status: 401 }
    );
  }

  const db = getDb();

  const row = (await db
    .prepare(
      `SELECT im.id, im.return_id, im.path, im.stored_name, im.mime_type, im.kind,
              im.original_name, r.user_id, r.order_id,
              COALESCE(r.customer_email, o.email) AS customer_email
         FROM return_images im
         JOIN return_requests r ON r.id = im.return_id
         JOIN orders o ON o.id = r.order_id
        WHERE im.return_id = ? AND im.id = ?`
    )
    .get(id, fileId)) as Row | undefined;

  if (!row) {
    return NextResponse.json({ error: "That file was not found." }, { status: 404 });
  }

  // Who is allowed to see it: the back office, or the customer whose
  // claim it is.
  const isStaff = can(user.role, "returns.view");
  const isOwner =
    row.user_id !== null && Number(row.user_id) === user.id;
  const isGuestOwner =
    row.user_id === null &&
    str(row.customer_email).toLowerCase() === user.email.toLowerCase();

  if (!isStaff && !isOwner && !isGuestOwner) {
    return NextResponse.json(
      { error: "You are not allowed to see this evidence." },
      { status: 403 }
    );
  }

  const bytes = await readEvidence(
    id,
    row.stored_name ? str(row.stored_name) : null,
    row.stored_name ? null : str(row.path)
  );

  if (!bytes) {
    return NextResponse.json({ error: "That file was not found." }, { status: 404 });
  }

  const contentType = contentTypeFor(
    row.stored_name ? str(row.stored_name) : null,
    row.mime_type ? str(row.mime_type) : null
  );

  const download = new URL(request.url).searchParams.get("download") === "1";
  const original = str(row.original_name) || `evidence-${row.id}.${contentType.split("/")[1] ?? "bin"}`;
  // The name the customer gave is only ever a label — the characters
  // that a header cannot carry are taken out of it.
  const safeName = original.replace(/[^\w.\- ]/g, "_").slice(0, 120);

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
