import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { after, connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { formatDay, formatDayRange } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/money";
import { invoiceStatus } from "@/lib/status";
import { Badge, Card, Skeleton } from "@/components/ui";
import { DraftInvoicesButton } from "./draft-invoices-button";
import { SyncButton } from "./sync-button";
import { syncOpenInvoices } from "@/lib/payments/sync";

export default function EventPage({ params }: PageProps<"/office/events/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <EventDetail params={params} />
    </Suspense>
  );
}

async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, schoolId: DEMO_SCHOOL_ID },
    include: {
      school: true,
      feeItems: true,
      enrolments: { include: { student: { include: { classroom: true } } } },
      invoices: {
        include: { family: true, lines: { include: { student: true } } },
        orderBy: { family: { familyName: "asc" } },
      },
    },
  });
  if (!event) notFound();

  // Quietly catch up with PayPal after the page is sent, in case a webhook was missed.
  after(() => syncOpenInvoices({ eventId: event.id, maxAgeMs: 60_000 }).catch(() => undefined));

  const currency = event.school.currency;
  const invoicedFamilies = new Set(event.invoices.map((i) => i.familyId));
  const uninvoiced = new Set(
    event.enrolments.filter((e) => e.attending && !invoicedFamilies.has(e.student.familyId)).map((e) => e.student.familyId),
  );
  const pendingBatch = await db.approvalItem.findFirst({
    where: { eventId: event.id, kind: "INVOICE_BATCH", status: { in: ["PENDING", "EXECUTING", "FAILED"] } },
  });

  const byClass = new Map<string, number>();
  for (const e of event.enrolments) byClass.set(e.student.classroom.name, (byClass.get(e.student.classroom.name) ?? 0) + 1);

  const live = event.invoices.filter((i) => i.status !== "PROPOSED");
  const billed = live.reduce((n, i) => n + toCents(i.total), 0);
  const paid = live.reduce((n, i) => n + toCents(i.amountPaid), 0);

  return (
    <>
      <Link href="/office/events" className="text-sm text-ink-soft hover:text-ink">
        ← Events
      </Link>
      <div className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-ink-soft">
            {formatDayRange(event.startsOn, event.endsOn)}
            {event.location && ` · ${event.location}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {live.length > 0 && <SyncButton eventId={event.id} />}
        {uninvoiced.size > 0 && !pendingBatch && <DraftInvoicesButton eventId={event.id} families={uninvoiced.size} />}
        {pendingBatch && (
          <Link href="/office/approvals" className="text-sm font-medium text-waiting hover:underline">
            Invoices waiting for your approval →
          </Link>
        )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <p className="text-sm text-ink-soft">{event.description}</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            {event.feeItems.map((f) => (
              <div key={f.id}>
                <dt className="text-ink-faint">{f.label}</dt>
                <dd className="mt-0.5 font-medium">
                  {formatMoney(toCents(f.amount), currency)} per student
                  {f.dueOn && <span className="font-normal text-ink-soft"> · due {formatDay(f.dueOn)}</span>}
                </dd>
                {f.depositAmount && (
                  <dd className="text-ink-soft">
                    {formatMoney(toCents(f.depositAmount), currency)} deposit
                    {f.depositDueOn && ` by ${formatDay(f.depositDueOn)}`}
                  </dd>
                )}
              </div>
            ))}
            <div>
              <dt className="text-ink-faint">Going</dt>
              <dd className="mt-0.5 font-medium">{event.enrolments.length} students</dd>
              <dd className="text-ink-soft">
                {[...byClass.entries()]
                  .sort()
                  .map(([c, n]) => `${c} (${n})`)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Consent</dt>
              <dd className="mt-0.5 font-medium">{event.needsConsent ? "Needed" : "Not needed"}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-ink-faint">Collected</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{formatMoney(paid, currency)}</p>
          <p className="text-sm text-ink-soft">of {formatMoney(billed, currency)} invoiced</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand" style={{ width: billed ? `${(paid / billed) * 100}%` : 0 }} />
          </div>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 font-semibold">Families</h2>
      {event.invoices.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-ink-soft">
          No invoices yet. Slip will draft one per family, combining siblings, for you to approve.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-faint">
              <tr>
                <th className="px-5 py-3 font-medium">Family</th>
                <th className="px-5 py-3 font-medium">Students</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 text-right font-medium">Paid</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {event.invoices.map((inv) => {
                const s = invoiceStatus[inv.status];
                return (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 font-medium">{inv.family.familyName}</td>
                    <td className="px-5 py-3 text-ink-soft">{inv.lines.map((l) => l.student.firstName).join(", ")}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatMoney(toCents(inv.total), currency)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatMoney(toCents(inv.amountPaid), currency)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
