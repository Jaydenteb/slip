import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { fromCents, toCents } from "../money";
import { getInvoice } from "../paypal/rest";
import { reconcile } from "./reconcile";

// Brings Slip's copy of an invoice up to date with PayPal. Safe to run any time and
// any number of times: payments are keyed by PayPal's payment id.
export async function syncInvoice(invoiceId: string, actor: "sync" | "webhook" = "sync") {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { event: true } });
  if (!invoice?.paypalInvoiceId) return { changed: false };

  const live = reconcile(await getInvoice(invoice.paypalInvoiceId));
  const known = new Set(
    (await db.payment.findMany({ where: { invoiceId }, select: { paypalPaymentId: true } })).map((p) => p.paypalPaymentId),
  );
  const newPayments = live.payments.filter((p) => !known.has(p.paypalPaymentId));
  const statusChanged = live.status !== null && live.status !== invoice.status;
  const paidChanged = live.amountPaid !== toCents(invoice.amountPaid);

  await db.$transaction(async (tx) => {
    for (const p of newPayments) {
      // createMany + skipDuplicates: a webhook and a sync racing can't double-count.
      await tx.payment.createMany({
        data: [{ invoiceId, paypalPaymentId: p.paypalPaymentId, method: p.method, amount: fromCents(p.amount), paidAt: p.paidAt, note: p.note }],
        skipDuplicates: true,
      });
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(live.status ? { status: live.status } : {}),
        amountPaid: fromCents(live.amountPaid),
        lastSyncedAt: new Date(),
      },
    });
    if (newPayments.length || statusChanged || paidChanged) {
      await tx.agentAction.create({
        data: {
          schoolId: invoice.event.schoolId,
          actor,
          action: "ledger.updated",
          input: { paypalInvoiceId: invoice.paypalInvoiceId } as Prisma.InputJsonValue,
          output: {
            status: live.status,
            amountPaid: fromCents(live.amountPaid),
            newPayments: newPayments.map((p) => ({ method: p.method, amount: fromCents(p.amount) })),
          } as Prisma.InputJsonValue,
        },
      });
    }
  });

  return { changed: newPayments.length > 0 || statusChanged || paidChanged };
}

// Syncs every open invoice (optionally for one event or family) not synced in the last `maxAgeMs`.
export async function syncOpenInvoices(opts: { eventId?: string; familyId?: string; maxAgeMs?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.maxAgeMs ?? 0));
  const invoices = await db.invoice.findMany({
    where: {
      ...(opts.eventId ? { eventId: opts.eventId } : {}),
      ...(opts.familyId ? { familyId: opts.familyId } : {}),
      paypalInvoiceId: { not: null },
      status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED"] },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });

  let changed = 0;
  const failed: string[] = [];
  for (let i = 0; i < invoices.length; i += 5) {
    const results = await Promise.allSettled(invoices.slice(i, i + 5).map((inv) => syncInvoice(inv.id)));
    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value.changed) changed++;
      if (r.status === "rejected") failed.push(invoices[i + j].id);
    });
  }
  return { checked: invoices.length, changed, failed };
}
