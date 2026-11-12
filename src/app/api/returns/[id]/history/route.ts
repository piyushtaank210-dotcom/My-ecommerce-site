import { fail, json, requireApiUser } from "@/lib/api";
import { maySeeReturn } from "@/lib/return-access";

/**
 * GET /api/returns/[id]/history — the whole of a request's history.
 *
 * Every status it has been through, with the date it happened and who
 * made the change.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const { ok, ret } = await maySeeReturn(id, guard.user);
  if (!ok || !ret) return fail("That request was not found.", 404);

  return json({
    returnId: ret.id,
    history: ret.events.map((ev) => ({
      id: ev.id,
      status: ev.status,
      from_status: ev.from_status,
      to_status: ev.to_status,
      note: ev.note,
      actor_type: ev.actor_type,
      actor_name: ev.actor_name,
      at: ev.created_at,
    })),
  });
}
