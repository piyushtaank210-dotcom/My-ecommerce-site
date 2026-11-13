import { redirect } from "next/navigation";

/**
 * The refund records now live inside Returns & Refunds.
 *
 * The page used to be here of its own, which meant the returns desk was
 * in three places. It is one place now — this URL goes there, so any
 * bookmark or link that points at it still works.
 */
export default function AdminRefundsRedirect() {
  redirect("/admin/returns?view=refunds");
}
