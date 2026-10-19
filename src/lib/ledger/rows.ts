import { db } from "../db";
import { toCents } from "../money";
import type { LedgerRow, LedgerStatus } from "./columns";
import type { InvoiceStatus } from "@prisma/client";

const STATUS: Record<InvoiceStatus, LedgerStatus> = {
  PROPOSED: "Waiting for approval",
  SENT: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Refunded",
};

// One row per student per event. Payments land on the family's invoice, so each
// student's share is the invoice's paid amount split in proportion to their line.
export async function loadLedgerRows(schoolId: string): Promise<LedgerRow[]> {
  const [enrolments, supportFlags] = await Promise.all([
    db.enrolment.findMany({
      where: { event: { schoolId, status: { not: "CANCELLED" } } },
      include: {
        student: { include: { classroom: true, family: true } },
        event: {
          include: {
            feeItems: true,
            invoices: { include: { lines: true, payments: { orderBy: { paidAt: "desc" } } } },
          },
        },
      },
    }),
    db.approvalItem.findMany({
      where: { schoolId, kind: "HARDSHIP_FLAG", status: "PENDING" },
      select: { familyId: true },
    }),
  ]);
  const support = new Set(supportFlags.map((f) => f.familyId));

  return enrolments.map((e) => {
    const s = e.student;
    const fee = e.event.feeItems.reduce((n, f) => n + toCents(f.amount), 0);
    const depositEach = e.event.feeItems.reduce((n, f) => n + (f.depositAmount ? toCents(f.depositAmount) : 0), 0);
    const invoice = e.event.invoices.find((i) => i.familyId === s.familyId);
    // A withdrawn child's line comes off the invoice, so they owe (and are owed) nothing here.
    const lineCents = !e.attending ? 0 : (invoice?.lines.filter((l) => l.studentId === s.id).reduce((n, l) => n + toCents(l.amount), 0) ?? fee);
    const invoiceTotal = invoice ? toCents(invoice.total) : 0;
    const paidCents = invoice && invoiceTotal > 0 ? Math.round((toCents(invoice.amountPaid) * lineCents) / invoiceTotal) : 0;
    const methods = new Set(invoice?.payments.map((p) => (p.method === "PAYPAL" ? "PayPal" : p.method === "CASH" ? "Cash" : "Other")));
    const last = invoice?.payments[0]?.paidAt;

    return {
      id: e.id,
      student: `${s.firstName} ${s.lastName}`,
      className: s.classroom.name,
      year: s.classroom.year,
      family: s.family.familyName,
      event: e.event.title,
      amount: lineCents / 100,
      paid: paidCents / 100,
      owing: (lineCents - paidCents) / 100,
      status: !e.attending ? "Withdrawn" : invoice ? STATUS[invoice.status] : "Not invoiced",
      depositPaid: !e.attending ? "Not going" : depositEach === 0 ? "No deposit" : paidCents >= depositEach ? "Yes" : "No",
      onPlan: invoice?.plan ? "Yes" : "No",
      needsSupport: support.has(s.familyId) ? "Yes" : "No",
      consent: e.event.needsConsent ? (e.consentGiven ? "Yes" : "No") : "Not needed",
      lastPayment: last ? last.toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }) : null,
      paidBy: [...methods].sort().join(" + "),
    };
  });
}
