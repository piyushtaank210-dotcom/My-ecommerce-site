import Link from "next/link";
import { Bell, BellOff, CheckCheck, ArrowRight, MailCheck } from "lucide-react";
import { requireUser } from "@/lib/guard";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
} from "@/lib/notifications";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Notifications" };

/**
 * The customer's messages.
 *
 * Every time the shop changes a request — a decision, a piece of
 * evidence asked for, a parcel on its way, money going back — the
 * customer is told, and the message is kept here. The shop's own
 * internal notes are never on this page.
 */
export default async function AccountNotificationsPage() {
  const user = await requireUser("/account/notifications");
  const notifications = await getNotificationsForUser(user.id);
  const unread = await getUnreadNotificationCount(user.id);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-ink">Notifications</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {unread > 0
              ? `${unread} message${unread === 1 ? "" : "s"} you have not read yet.`
              : "Everything the shop has told you about your requests."}
          </p>
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-brand px-2.5 py-1 text-[12px] font-bold text-white">
            {unread} new
          </span>
        )}
      </header>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-xs">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-400">
            <BellOff className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            Nothing here yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-gray-500">
            When you raise a return or replacement request, we will write
            to you here every time it moves.
          </p>
          <Link href="/account/returns" className="btn btn-primary btn-sm mt-5">
            My requests
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border bg-white p-4 shadow-xs ${
                n.status === "unread"
                  ? "border-brand/40 bg-brand-tint/10"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    n.status === "unread"
                      ? "bg-brand text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {n.status === "unread" ? (
                    <Bell className="h-4 w-4" />
                  ) : (
                    <CheckCheck className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[14px] font-bold text-ink">{n.title}</p>
                    <span className="text-[11.5px] text-gray-400">
                      {formatDate(n.created_at)}
                    </span>
                  </div>

                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
                    {n.body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {n.return_id && (
                      <Link
                        href={`/account/returns/${n.return_id}`}
                        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                      >
                        Track request {n.return_id}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    {!n.return_id && n.order_id && (
                      <Link
                        href={`/order/${n.order_id}`}
                        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                      >
                        See order {n.order_id}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    {n.email_status === "sent" && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-gray-400">
                        <MailCheck className="h-3 w-3" />
                        Also sent to your email
                      </span>
                    )}
                    {n.email_status === "not_configured" && (
                      <span className="text-[11.5px] text-gray-400">
                        We have recorded this. Email is not set up on the
                        shop yet.
                      </span>
                    )}
                    {n.email_status === "failed" && (
                      <span className="text-[11.5px] text-amber-600">
                        We could not send this by email. It is here, and
                        the shop has been told.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
