import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { formatMoment } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every decision and every PayPal call, in order. Slip's agents can propose; only an approval can make a PayPal call."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ActivityLog />
      </Suspense>
    </>
  );
}

const actorLabel: Record<string, string> = {
  executor: "Slip (approved)",
  office: "School office",
  "office-agent": "Slip",
  "parent-agent": "Slip (parent chat)",
  webhook: "PayPal",
  sync: "Sync",
};

// Plain words for the office. PayPal calls also show the Agent Toolkit tool's own name.
const ACTION_LABEL: Record<string, string> = {
  "paypal.create_invoice": "Created an invoice",
  "paypal.send_invoice": "Sent an invoice",
  "paypal.send_invoice_reminder": "Sent a reminder",
  "paypal.update_invoicing": "Updated an invoice",
  "paypal.cancel_sent_invoice": "Cancelled an invoice",
  "paypal.create_refund": "Refunded a PayPal payment",
  "paypal.record_refund_for_invoice": "Recorded a refund",
  "paypal.record_payment_for_invoice": "Recorded a payment",
  "paypal.generate_invoice_qr_code": "Made an invoice QR code",
  "paypal.get_invoice": "Read an invoice",
  "approval.approved": "Approved",
  "approval.rejected": "Rejected",
  "proposed.payment_plan": "Asked for a payment plan",
  "proposed.support_flag": "Flagged a family for support",
  "proposed.withdrawal": "Asked for a withdrawal",
  "ledger.updated": "Updated the ledger from PayPal",
  "ledger.asked": "Answered a ledger question",
};

function describe(action: string) {
  return ACTION_LABEL[action] ?? action.replaceAll(".", " ").replaceAll("_", " ");
}

type Row = {
  id: string;
  createdAt: Date;
  actor: string;
  action: string;
  ok: boolean;
  approvalItemId: string | null;
  title: string;
  count: number;
};

// A batch makes the same call once per family (interleaved, a few at a time); show each
// kind of call once per approval with a count. Runs of syncs collapse the same way.
function collapse(
  actions: {
    id: string;
    createdAt: Date;
    actor: string;
    action: string;
    ok: boolean;
    approvalItemId: string | null;
    approvalItem: { title: string } | null;
  }[],
) {
  const rows: Row[] = [];
  const byApproval = new Map<string, Row>();
  for (const a of actions) {
    const key = a.approvalItemId && `${a.approvalItemId}|${a.actor}|${a.action}|${a.ok}`;
    const same = key ? byApproval.get(key) : undefined;
    const prev = rows[rows.length - 1];
    if (same) {
      same.count++;
    } else if (!key && prev && !prev.approvalItemId && prev.actor === a.actor && prev.action === a.action && prev.ok === a.ok) {
      prev.count++;
    } else {
      const row = { ...a, title: a.approvalItem?.title ?? "", count: 1 };
      rows.push(row);
      if (key) byApproval.set(key, row);
    }
  }
  return rows;
}

async function ActivityLog() {
  await connection();
  const actions = await db.agentAction.findMany({
    where: { schoolId: DEMO_SCHOOL_ID },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { approvalItem: { select: { title: true } } },
  });
  if (!actions.length)
    return <EmptyState title="Nothing yet">Activity appears as soon as Slip proposes something or a payment arrives.</EmptyState>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-ink-faint">
          <tr>
            <th className="hidden px-5 py-3 font-medium sm:table-cell">When</th>
            <th className="px-4 py-3 font-medium sm:px-5">Who</th>
            <th className="px-4 py-3 font-medium sm:px-5">What</th>
            <th className="hidden px-5 py-3 font-medium md:table-cell">For</th>
            <th className="hidden px-5 py-3 font-medium sm:table-cell">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {collapse(actions).map((a) => (
            <tr key={a.id} className="align-top">
              <td className="hidden px-5 py-2.5 whitespace-nowrap text-ink-soft sm:table-cell">{formatMoment(a.createdAt)}</td>
              <td className="px-4 py-2.5 sm:px-5 sm:whitespace-nowrap">
                {actorLabel[a.actor] ?? a.actor}
                {/* On a phone, when sits under who. */}
                <span className="block text-xs text-ink-faint sm:hidden">{formatMoment(a.createdAt)}</span>
              </td>
              <td className="px-4 py-2.5 sm:px-5">
                {describe(a.action)}
                {a.count > 1 && <span className="text-ink-soft"> &times; {a.count}</span>}
                {a.action.startsWith("paypal.") && (
                  <code className="ml-2 rounded bg-paper px-1.5 py-0.5 font-mono text-xs text-ink-soft">{a.action.slice(7)}</code>
                )}
                {a.title && <span className="mt-0.5 block text-xs text-ink-faint md:hidden">{a.title}</span>}
                {!a.ok && (
                  <span className="mt-1 block sm:hidden">
                    <Badge tone="danger">Failed</Badge>
                  </span>
                )}
              </td>
              <td className="hidden max-w-xs truncate px-5 py-2.5 text-ink-soft md:table-cell">{a.title}</td>
              <td className="hidden px-5 py-2.5 sm:table-cell">
                {a.ok ? <Badge tone="brand">OK</Badge> : <Badge tone="danger">Failed</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
