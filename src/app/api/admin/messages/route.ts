import { countMessages, listMessages } from "@/lib/admin";
import { json, paged, pageParams, requireApiPermission } from "@/lib/api";

/**
 * GET /api/admin/messages — the enquiries from the contact page.
 *
 *   ?q=        name, email, body or order id
 *   ?status=new|open|answered|closed
 *   ?subject=order|returns|...
 *   ?page=1&limit=25
 */
export async function GET(request: Request) {
  const guard = await requireApiPermission("messages.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const { limit, offset, page } = pageParams(url);

  const query = {
    q: url.searchParams.get("q")?.trim() || undefined,
    status: url.searchParams.get("status")?.trim() || undefined,
    subject: url.searchParams.get("subject")?.trim() || undefined,
    limit,
    offset,
  };

  return json(paged(listMessages(query), countMessages(query), page, limit));
}
