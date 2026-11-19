import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { countMessages, listMessages } from "@/lib/admin";
import { listRepliesForMessages } from "@/lib/enquiry-replies";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { CONTACT_SUBJECTS } from "@/lib/contact";
import { Pagination } from "@/components/admin/ui/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { MessageStatusSelect } from "@/components/admin/MessageStatusSelect";
import { EnquiryEmailStatus } from "@/components/admin/EnquiryEmailStatus";
import { EnquiryReplyButton } from "@/components/admin/EnquiryReply";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Badge } from "@/components/admin/ui/Badge";

export const metadata = { title: "Enquiries" };

const PER_PAGE = 15;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

const SUBJECT_LABEL: Record<string, string> = {
  product: "Product question",
  order: "About an order",
  support: "Support",
  returns: "Returns",
  other: "Something else",
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("messages.view");
  const sp = await searchParams;
  const canHandle = can(user.role, "messages.handle");

  const q = one(sp.q).trim() || undefined;
  const status = one(sp.status) || "all";
  const subject = one(sp.subject) || "all";
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10));

  const query = {
    q,
    status: status === "all" ? undefined : status,
    subject: subject === "all" ? undefined : subject,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const messages = (await listMessages(query));
  const total = (await countMessages(query));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // The replies to every enquiry on the page, asked for together — the
  // database is far away, and one question for the lot of them is one
  // question.
  const replies = await listRepliesForMessages(messages.map((m) => m.id));

  const pageLink = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    if (subject !== "all") p.set("subject", subject);
    if (n > 1) p.set("page", String(n));
    const qs = p.toString();
    return `/admin/messages${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Enquiries"
        description={`${total} message${total === 1 ? "" : "s"} from the contact page. Answer the new ones first.`}
      />

      <div className="admin-toolbar">
        <PanelSearch placeholder="Search name, email, body or order" />
        <PanelFilter
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All statuses" },
            { value: "new", label: "New" },
            { value: "open", label: "In progress" },
            { value: "answered", label: "Answered" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <PanelFilter
          name="subject"
          label="Subject"
          value={subject}
          options={[
            { value: "all", label: "All subjects" },
            ...CONTACT_SUBJECTS.map((s) => ({
              value: s,
              label: SUBJECT_LABEL[s] ?? s,
            })),
          ]}
        />
      </div>

      {messages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages match"
          description="Nothing here matches the search and the filters. Clear them and the whole list comes back."
          action={
            <Link href="/admin/messages" className="btn btn-outline btn-sm">
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {messages.map((m) => {
              const thread = replies.get(m.id) ?? [];
              const sent = thread.filter((r) => r.status === "sent").length;

              return (
                <article key={m.id} className="admin-panel">
                  <div className="admin-panel-head">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {SUBJECT_LABEL[m.subject] ?? m.subject}
                        </Badge>
                        {m.order_id && (
                          <Link
                            href={`/admin/orders/${m.order_id}`}
                            className="tnum rounded-full bg-brand-tint px-2.5 py-0.5 text-[11.5px] font-semibold text-brand hover:underline"
                          >
                            {m.order_id}
                          </Link>
                        )}
                        {m.status === "new" && (
                          <Badge tone="warn">New</Badge>
                        )}
                        {sent > 0 && <Badge tone="good">Replied</Badge>}
                      </div>
                      <p className="mt-2 text-[14px] font-semibold text-ink">
                        {m.name}
                      </p>
                      <p className="text-[12.5px] text-gray-500">
                        {m.email} · {formatDate(m.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <EnquiryEmailStatus
                        messageId={m.id}
                        status={m.email_status}
                        sentAt={m.email_sent_at}
                      />
                      {canHandle && (
                        <MessageStatusSelect
                          key={`${m.id}-${m.status}`}
                          messageId={m.id}
                          status={m.status}
                        />
                      )}
                      {canHandle && (
                        <EnquiryReplyButton
                          messageId={m.id}
                          customerName={m.name}
                          customerEmail={m.email}
                          subjectLabel={SUBJECT_LABEL[m.subject] ?? m.subject}
                          orderId={m.order_id}
                          receivedAt={formatDate(m.created_at)}
                          originalMessage={m.message}
                        />
                      )}
                    </div>
                  </div>

                  <div className="admin-panel-body">
                    <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-gray-600">
                      {m.message}
                    </p>

                    {thread.length > 0 && (
                      <div className="mt-4 border-t border-gray-100 pt-3.5">
                        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">
                          {sent > 0
                            ? `Replies (${sent})`
                            : "Replies"}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {thread.map((r) => (
                            <li
                              key={r.id}
                              className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
                                <Badge tone={r.status === "sent" ? "good" : "bad"}>
                                  {r.status === "sent" ? "Sent" : "Not sent"}
                                </Badge>
                                <span>
                                  {formatDateTime(r.sent_at ?? r.created_at)}
                                </span>
                                {r.sent_by_name && (
                                  <span>· by {r.sent_by_name}</span>
                                )}
                              </div>
                              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-gray-700">
                                {r.body}
                              </p>
                              {r.error && (
                                <p className="mt-1.5 text-[12px] text-red-600">
                                  {r.error}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {m.handled_by_name && (
                      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[12px] text-gray-400">
                        Handled by {m.handled_by_name}
                        {m.handled_at ? ` on ${formatDate(m.handled_at)}` : ""}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="admin-table-foot">
            <span className="tnum">
              Showing {(page - 1) * PER_PAGE + 1}–
              {(page - 1) * PER_PAGE + messages.length} of {total}
            </span>
            <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
          </div>
        </>
      )}
    </>
  );
}
