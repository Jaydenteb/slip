import type { InvoiceStatus, PaymentMethod } from "@prisma/client";
import type { PayPalInvoice } from "../paypal/rest";
import { toCents, type Cents } from "../money";

// Pure mapping from PayPal's view of an invoice to Slip's. PayPal is the source of
// truth for money; Slip mirrors it, so sync and webhooks can run any number of times.

const STATUS: Record<string, InvoiceStatus> = {
  SENT: "SENT",
  UNPAID: "SENT",
  SCHEDULED: "SENT",
  PAYMENT_PENDING: "SENT",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  MARKED_AS_PAID: "PAID",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  MARKED_AS_REFUNDED: "REFUNDED",
};

const METHOD: Record<string, PaymentMethod> = {
  PAYPAL: "PAYPAL",
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  WIRE_TRANSFER: "BANK_TRANSFER",
};

export type ReconciledPayment = {
  paypalPaymentId: string;
  method: PaymentMethod;
  amount: Cents;
  paidAt: Date;
  note: string | null;
};

export type Reconciled = {
  status: InvoiceStatus | null; // null: a PayPal status we don't track (e.g. DRAFT); leave ours alone
  amountPaid: Cents; // net of refunds
  amountRefunded: Cents;
  payments: ReconciledPayment[];
};

export function reconcile(invoice: PayPalInvoice): Reconciled {
  const payments = (invoice.payments?.transactions ?? [])
    .filter((t) => t.payment_id && t.amount)
    .map((t) => ({
      paypalPaymentId: t.payment_id!,
      method: METHOD[t.method ?? ""] ?? "OTHER",
      amount: toCents(t.amount!.value),
      // payment_date_time is exact; payment_date alone is a calendar day in PayPal's time zone.
      paidAt: new Date(t.payment_date_time ?? `${t.payment_date}T00:00:00Z`),
      note: t.note ?? null,
    }));
  // PayPal keeps the gross paid amount after a refund and reports refunds separately.
  const gross = invoice.payments?.paid_amount ? toCents(invoice.payments.paid_amount.value) : 0;
  const refunded = invoice.refunds?.refund_amount ? toCents(invoice.refunds.refund_amount.value) : 0;
  return {
    status: STATUS[invoice.status] ?? null,
    amountPaid: gross - refunded,
    amountRefunded: refunded,
    payments,
  };
}

// After a child is withdrawn, PayPal calls the invoice (partly) refunded even when a
// sibling is still going. What the office needs to know is whether the rest is paid.
export function statusAfterRefunds(status: InvoiceStatus, total: Cents, netPaid: Cents): InvoiceStatus {
  if (status !== "REFUNDED" && status !== "PARTIALLY_REFUNDED") return status;
  if (total === 0) return "REFUNDED";
  return netPaid >= total ? "PAID" : netPaid > 0 ? "PARTIALLY_PAID" : "SENT";
}
