import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { countMessages, listMessages } from "@/lib/admin";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { CONTACT_SUBJECTS } from "@/lib/contact";
import { Pagination } from "@/components/Pagination";
import { PanelSearch } from "@/components/admin/PanelSearch";
import { PanelFilter } from "@/components/admin/PanelFilter";
import { MessageStatusSelect } from "@/components/admin/MessageStatusSelect";
import { EnquiryEmailStatus } from "@/components/admin/EnquiryEmailStatus";

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
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold text-ink">Enquiries</h1>
        <p className="mt-1.5 text-[13.5px] text-gray-500">
          {total} message{total === 1 ? "" : "s"} from the contact page.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <MessageSquare className="h-9 w-9 text-gray-300" />
          <h2 className="mt-4 text-[16px] font-semibold text-ink">
            No messages match
          </h2>
          <Link href="/admin/messages" className="btn btn-outline btn-sm mt-5">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <article
              key={m.id}
              className="rounded-xl border border-gray-200 bg-white p-5"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-gray-600">
                      {SUBJECT_LABEL[m.subject] ?? m.subject}
                    </span>
                    {m.order_id && (
                      <Link
                        href={`/admin/orders/${m.order_id}`}
                        className="tnum rounded-full bg-brand-tint px-2.5 py-0.5 text-[11.5px] font-semibold text-brand hover:underline"
                      >
                        {m.order_id}
                      </Link>
                    )}
                    {m.status === "new" && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700">
                        New
                      </span>
                    )}
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
                    <MessageStatusSelect messageId={m.id} status={m.status} />
                  )}
                </div>
              </header>

              <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-gray-600">
                {m.message}
              </p>

              {m.handled_by_name && (
                <p className="mt-3 border-t border-gray-100 pt-2.5 text-[12px] text-gray-400">
                  Handled by {m.handled_by_name}
                  {m.handled_at ? ` on ${formatDate(m.handled_at)}` : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} pageLink={pageLink} />
    </div>
  );
}
