import type { ApprovalKind, ApprovalStatus, InvoiceStatus } from "@prisma/client";

export type Tone = "neutral" | "brand" | "waiting" | "danger" | "info";

export const invoiceStatus: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  PROPOSED: { label: "Waiting for approval", tone: "waiting" },
  SENT: { label: "Sent", tone: "info" },
  PARTIALLY_PAID: { label: "Part paid", tone: "waiting" },
  PAID: { label: "Paid", tone: "brand" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Part refunded", tone: "neutral" },
};

export const approvalStatus: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Waiting for you", tone: "waiting" },
  APPROVED: { label: "Approved", tone: "brand" },
  EXECUTING: { label: "Running", tone: "info" },
  EXECUTED: { label: "Done", tone: "brand" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  FAILED: { label: "Needs another try", tone: "danger" },
};

export const approvalKind: Record<ApprovalKind, string> = {
  INVOICE_BATCH: "Invoices",
  PAYMENT_PLAN: "Payment plan",
  REMINDER_BATCH: "Reminders",
  REFUND: "Withdrawal",
  CASH_PAYMENT: "Cash payment",
  HARDSHIP_FLAG: "Family needs support",
};
