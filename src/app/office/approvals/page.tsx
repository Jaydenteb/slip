import { Suspense } from "react";
import { clsx } from "clsx";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import type { InvoiceBatchPayload } from "@/lib/executor/run";
import type { ReminderBatchPayload } from "@/lib/reminders/service";
import type { WithdrawalPayload } from "@/lib/withdrawals/service";
import { TIER_LABEL, type ReminderTier } from "@/lib/reminders/select";
import { formatMoment, isRecent } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/money";
import { approvalKind, approvalStatus } from "@/lib/status";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { DecisionButtons } from "./decision-buttons";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Slip drafts; you decide. Anything that contacts a family or moves money waits here until a person approves it."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Approvals />
      </Suspense>
    </>
  );
}

async function Approvals() {
  await connection();
  const [open, decided] = await Promise.all([
    db.approvalItem.findMany({
      where: { schoolId: DEMO_SCHOOL_ID, status: { in: ["PENDING", "EXECUTING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
    }),
    db.approvalItem.findMany({
      where: { schoolId: DEMO_SCHOOL_ID, status: { in: ["EXECUTED", "REJECTED"] } },
      orderBy: { decidedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-10">
      <section className="grid grid-cols-1 gap-4">
        {open.length === 0 ? (
          <EmptyState title="Nothing waiting">When Slip drafts invoices, payment plans or refunds, they&rsquo;ll appear here.</EmptyState>
        ) : (
          open.map((item) => (
            <Card key={item.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{approvalKind[item.kind]}</Badge>
                    <Badge tone={approvalStatus[item.status].tone}>{approvalStatus[item.status].label}</Badge>
                  </div>
                  <h2 className="mt-2 font-semibold">{item.title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-ink-soft">{item.summary}</p>
                  <ParentWords item={item} />
                </div>
                <DecisionButtons id={item.id} kind={item.kind} running={item.status === "EXECUTING"} />
              </div>
              {item.status === "FAILED" && item.error && (
                <pre className="mt-4 overflow-x-auto rounded-lg bg-danger-tint/60 p-3 text-xs whitespace-pre-wrap text-danger">{item.error}</pre>
              )}
              {item.kind === "INVOICE_BATCH" && <InvoiceBatchDetail payload={item.payload as InvoiceBatchPayload} />}
              {item.kind === "REFUND" && <WithdrawalDetail payload={item.payload as unknown as WithdrawalPayload} />}
              {item.kind === "REMINDER_BATCH" && <ReminderBatchDetail payload={item.payload as unknown as ReminderBatchPayload} />}
            </Card>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-soft">Recently decided</h2>
          <Card className="divide-y divide-line">
            {decided.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  "flex flex-wrap items-center gap-3 px-5 py-3 text-sm",
                  // Just decided: glow once, so the office sees where it went.
                  isRecent(item.decidedAt, 20_000) && "animate-glow",
                )}
              >
                <Badge tone={approvalStatus[item.status].tone}>{approvalStatus[item.status].label}</Badge>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.decidedAt && <span className="text-ink-faint">{formatMoment(item.decidedAt)}</span>}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

// Words that came from a parent (or Slip's summary of them) are shown apart from Slip's
// own summary and marked as unchecked, so they can't pass for the facts of the request.
function ParentWords({ item }: { item: { kind: string; proposedBy: string; payload: unknown } }) {
  const payload = (item.payload ?? {}) as { parentNote?: string | null; reason?: string | null };
  const words = item.kind === "REFUND" ? payload.reason : payload.parentNote;
  if (!words) return null;
  const fromParent = item.proposedBy === "parent-agent";
  return (
    <figure className="mt-3 max-w-3xl border-l-2 border-line pl-3 text-sm">
      <figcaption className="text-xs text-ink-faint">
        {fromParent ? "From the parent, passed on by Slip from the chat. Unchecked." : "Reason given by the office"}
      </figcaption>
      <blockquote className="mt-0.5 text-ink-soft italic">{words}</blockquote>
    </figure>
  );
}

async function InvoiceBatchDetail({ payload }: { payload: InvoiceBatchPayload }) {
  const invoices = await db.invoice.findMany({
    where: { id: { in: payload.invoiceIds } },
    include: { family: true, event: { include: { school: true } }, lines: { include: { student: { include: { classroom: true } } } } },
    orderBy: { family: { familyName: "asc" } },
  });
  if (!invoices.length) return null;
  const currency = invoices[0].event.school.currency;

  return (
    <details className="group mt-4 rounded-lg border border-line">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink">
        <span className="group-open:hidden">Show all {invoices.length} invoices</span>
        <span className="hidden group-open:inline">Hide invoices</span>
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Family</th>
              <th className="px-4 py-2 font-medium">Students</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-right font-medium">Minimum first payment</th>
              <th className="px-4 py-2 font-medium">Sent to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-2 font-medium">{inv.family.familyName}</td>
                <td className="px-4 py-2 text-ink-soft">
                  {inv.lines.map((l) => `${l.student.firstName} (${l.student.classroom.name})`).join(", ")}
                  {inv.lines.length > 1 && <Badge tone="info" className="ml-2">Siblings combined</Badge>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(toCents(inv.total), currency)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {inv.minimumPayment ? formatMoney(toCents(inv.minimumPayment), currency) : "Full amount"}
                </td>
                <td className="px-4 py-2 text-ink-soft">{inv.family.email ?? "Printed note (no email)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const TIER_TONE: Record<ReminderTier, "info" | "waiting" | "danger"> = { gentle: "info", overdue: "waiting", final: "danger" };

function ReminderBatchDetail({ payload }: { payload: ReminderBatchPayload }) {
  const tiers = (Object.keys(TIER_LABEL) as ReminderTier[]).filter((t) => payload.notes[t]);
  return (
    <div className="mt-4 grid gap-3">
      {tiers.map((t) => {
        const note = payload.notes[t]!;
        const families = payload.reminders.filter((r) => r.tier === t);
        return (
          <div key={t} className="rounded-lg border border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              <Badge tone={TIER_TONE[t]}>{TIER_LABEL[t]}</Badge>
              <span>
                {families.length} {families.length === 1 ? "family" : "families"}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">{note.subject}</p>
            <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{note.note}</p>
          </div>
        );
      })}
      <details className="group rounded-lg border border-line">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink">
          <span className="group-open:hidden">
            Show who gets one{payload.skipped.length > 0 && ` and who's left out`}
          </span>
          <span className="hidden group-open:inline">Hide families</span>
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Family</th>
                <th className="px-4 py-2 font-medium">Reminder</th>
                <th className="px-4 py-2 text-right font-medium">Owing</th>
                <th className="px-4 py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payload.reminders.map((r) => (
                <tr key={r.invoiceId}>
                  <td className="px-4 py-2 font-medium">{r.familyName}</td>
                  <td className="px-4 py-2">
                    <Badge tone={TIER_TONE[r.tier]}>{TIER_LABEL[r.tier]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(toCents(r.owing))}</td>
                  <td className="px-4 py-2 text-ink-soft">{r.reason}</td>
                </tr>
              ))}
              {payload.skipped.map((s, i) => (
                <tr key={`${s.familyName}-${i}`} className="text-ink-faint">
                  <td className="px-4 py-2 font-medium">{s.familyName}</td>
                  <td className="px-4 py-2">Left out</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// Exactly what approving will do, step by step, so nothing about the money is a surprise.
function WithdrawalDetail({ payload }: { payload: WithdrawalPayload }) {
  const { plan } = payload;
  const steps = [
    plan.cancel
      ? "Cancel the PayPal invoice (the family is told by email)"
      : plan.paypalItems.length
        ? `Update the PayPal invoice to: ${plan.paypalItems.map((i) => `${i.name} ${formatMoney(i.amount)}`).join(", ")}`
        : null,
    ...plan.refundSteps.map((s) =>
      s.kind === "paypal"
        ? `Refund ${formatMoney(s.amount)} to the family's PayPal account`
        : `Record ${formatMoney(s.amount)} handed back (${s.method.toLowerCase().replace("_", " ")})`,
    ),
    `Mark ${plan.withdrawn.join(" and ")} as not going`,
  ].filter((s): s is string => s !== null);
  return (
    <ol className="mt-4 grid list-decimal gap-1 rounded-lg border border-line bg-paper py-3 pr-4 pl-9 text-sm text-ink-soft">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
