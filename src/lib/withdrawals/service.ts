import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { formatMoney, toCents, type Cents } from "../money";
import { syncInvoice } from "../payments/sync";
import { planWithdrawal, type WithdrawalPlan } from "./plan";
import { cleanQuote, UserError } from "../errors";

// Everything the executor needs is worked out now and shown to the office, so what runs
// on approval is exactly what was approved. If payments change in between, it stops.
export type WithdrawalPayload = {
  invoiceId: string;
  eventId: string;
  studentIds: string[];
  reason: string | null;
  grossPaid: Cents;
  refundedSoFar: Cents;
  plan: WithdrawalPlan;
};

export async function loadForWithdrawal(invoiceId: string) {
  await syncInvoice(invoiceId).catch(() => undefined);
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      family: true,
      event: { include: { school: true } },
      lines: { include: { student: true } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  // What Slip has already refunded from each PayPal capture, and on this invoice in all,
  // from the audit log. PayPal takes a few seconds to show a refund on the invoice, so
  // the audit log is the faster source of truth.
  const refunds = await db.agentAction.findMany({
    where: {
      schoolId: inv.event.schoolId,
      action: { in: [...REFUND_ACTIONS] },
      ok: true,
    },
    select: { action: true, input: true },
  });
  const refundedFrom = new Map<string, Cents>();
  let auditedRefunds: Cents = 0;
  for (const r of refunds) {
    const input = r.input as {
      capture_id?: string;
      invoice_id?: string;
      amount?: { value: string };
    } | null;
    if (!input?.amount) continue;
    if (input.invoice_id && input.invoice_id === inv.paypalInvoiceId) auditedRefunds += toCents(input.amount.value);
    if (r.action === "paypal.create_refund" && input.capture_id) {
      refundedFrom.set(input.capture_id, (refundedFrom.get(input.capture_id) ?? 0) + toCents(input.amount.value));
    }
  }
  return { inv, refundedFrom, auditedRefunds };
}

export const REFUND_ACTIONS = ["paypal.create_refund", "paypal.record_refund_for_invoice"] as const;

export async function proposeWithdrawal(opts: {
  invoiceId: string;
  studentIds: string[];
  reason: string | null;
  proposedBy: "parent-agent" | "office";
}) {
  await assertNoOpenWithdrawal(db, opts.invoiceId);

  const { inv, refundedFrom, auditedRefunds } = await loadForWithdrawal(opts.invoiceId);
  if (!inv.paypalInvoiceId || !["SENT", "PARTIALLY_PAID", "PAID"].includes(inv.status)) {
    throw new UserError("Only invoices that have been sent can have children withdrawn.");
  }
  const netPaid = toCents(inv.amountPaid);
  const refundedSoFar = toCents(inv.amountRefunded);
  // A refund Slip made is still on its way to PayPal: planning now would refund it twice.
  if (auditedRefunds > refundedSoFar) {
    throw new UserError("A refund on this invoice is still reaching PayPal. Try again in a minute.");
  }
  const plan = planWithdrawal({
    lines: inv.lines.map((l) => ({
      studentId: l.studentId,
      firstName: l.student.firstName,
      label: l.label,
      amount: toCents(l.amount),
    })),
    withdraw: opts.studentIds,
    netPaid,
    refundedSoFar,
    minimum: inv.minimumPayment != null ? toCents(inv.minimumPayment) : null,
    payments: inv.payments
      .filter((p) => p.paypalPaymentId)
      .map((p) => ({
        paymentId: p.paypalPaymentId!,
        method: p.method,
        amount: toCents(p.amount),
        refunded: refundedFrom.get(p.paypalPaymentId!) ?? 0,
      })),
  });

  const currency = inv.event.school.currency;
  const money = (c: Cents) => formatMoney(c, currency);
  const names = joinNames(plan.withdrawn);
  const back = (kind: "paypal" | "record") => plan.refundSteps.filter((s) => s.kind === kind).reduce((n, s) => n + s.amount, 0);
  const summary = [
    plan.cancel
      ? `Nothing has been paid, so the ${money(toCents(inv.total))} PayPal invoice is cancelled.`
      : plan.remainingLines.length
        ? `The invoice drops from ${money(toCents(inv.total))} to ${money(plan.remainingTotal)}.`
        : `Nobody from this family is going any more.`,
    plan.refund > 0
      ? `They've paid ${money(netPaid)}, so ${money(plan.refund)} is refunded${[
          back("paypal") ? `: ${money(back("paypal"))} back to their PayPal account` : null,
          back("record") ? `${back("paypal") ? " and" : ":"} ${money(back("record"))} for the office to hand back` : null,
        ]
          .filter(Boolean)
          .join("")}.`
      : netPaid > 0
        ? `The ${money(netPaid)} they've paid stays on the invoice; ${money(plan.stillOwing)} is still owing.`
        : null,
    inv.plan && !plan.cancel ? "Their payment plan no longer fits, so it's cleared; they can ask for a new one." : null,
  ]
    .filter(Boolean)
    .join(" ");

  const payload: WithdrawalPayload = {
    invoiceId: inv.id,
    eventId: inv.eventId,
    // Only children who are on this invoice: these ids decide whose enrolment changes.
    studentIds: [...new Set(inv.lines.filter((l) => plan.withdrawnIds.includes(l.studentId)).map((l) => l.studentId))],
    reason: cleanQuote(opts.reason, 200),
    grossPaid: netPaid + refundedSoFar,
    refundedSoFar,
    plan,
  };
  // One withdrawal per invoice at a time: the check and the insert happen under a lock,
  // so the parent chat and the office can't both draft one at the same moment.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`withdrawal:${inv.id}`}))`;
    await assertNoOpenWithdrawal(tx, inv.id);
    return tx.approvalItem.create({
      data: {
        schoolId: inv.event.schoolId,
        kind: "REFUND",
        title: `Withdraw ${names} from ${inv.event.title} (${inv.family.familyName} family)`,
        summary,
        payload: payload as unknown as Prisma.InputJsonValue,
        proposedBy: opts.proposedBy,
        familyId: inv.familyId,
        eventId: inv.eventId,
      },
    });
  });
}

async function assertNoOpenWithdrawal(client: Pick<Prisma.TransactionClient, "approvalItem">, invoiceId: string) {
  const pending = await client.approvalItem.findFirst({
    where: {
      kind: "REFUND",
      status: { in: ["PENDING", "EXECUTING", "FAILED"] },
      payload: { path: ["invoiceId"], equals: invoiceId },
    },
  });
  if (pending) throw new UserError("There's already a withdrawal for this invoice waiting for the office.");
}

export function joinNames(names: string[]) {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
