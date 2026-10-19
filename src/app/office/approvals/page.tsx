import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import type { InvoiceBatchPayload } from "@/lib/executor/run";
import { formatMoment } from "@/lib/format";
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
    <div className="grid gap-10">
      <section className="grid gap-4">
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
                </div>
                <DecisionButtons id={item.id} kind={item.kind} running={item.status === "EXECUTING"} />
              </div>
              {item.status === "FAILED" && item.error && (
                <pre className="mt-4 overflow-x-auto rounded-lg bg-danger-tint/60 p-3 text-xs whitespace-pre-wrap text-danger">{item.error}</pre>
              )}
              {item.kind === "INVOICE_BATCH" && <InvoiceBatchDetail payload={item.payload as InvoiceBatchPayload} />}
            </Card>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-soft">Recently decided</h2>
          <Card className="divide-y divide-line">
            {decided.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
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
