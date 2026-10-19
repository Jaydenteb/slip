import type { Cents } from "../money";
import { UserError } from "../errors";

// What withdrawing children from a family's invoice means in money: the invoice drops
// to the children still going, and anything paid beyond that is refunded. PayPal can't
// cancel an invoice once anything is paid, and it keeps counting refunded money as paid,
// so the PayPal invoice keeps a "withdrawn – refunded" line to balance its books.

export type WithdrawalInput = {
  lines: { studentId: string; firstName: string; label: string; amount: Cents }[];
  withdraw: string[]; // student ids
  netPaid: Cents; // paid minus refunded so far
  refundedSoFar: Cents;
  minimum: Cents | null;
  // Payments on the invoice, newest first, with what Slip has already refunded from each.
  payments: { paymentId: string; method: string; amount: Cents; refunded: Cents }[];
};

export type RefundStep =
  | { kind: "paypal"; captureId: string; amount: Cents }
  | { kind: "record"; method: string; amount: Cents };

export type WithdrawalPlan = {
  withdrawn: string[]; // first names
  withdrawnIds: string[]; // student ids, only those actually on the invoice
  remainingLines: WithdrawalInput["lines"];
  remainingTotal: Cents;
  refund: Cents;
  stillOwing: Cents;
  cancel: boolean; // nothing was ever paid and nobody is left: cancel the PayPal invoice
  // The PayPal invoice's new items; empty when it's paid in full, which PayPal won't let
  // anyone edit (the refund alone settles it).
  paypalItems: { name: string; amount: Cents }[];
  minimum: Cents | null;
  refundSteps: RefundStep[];
};

export function planWithdrawal(input: WithdrawalInput): WithdrawalPlan {
  const leaving = new Set(input.withdraw);
  const withdrawnLines = input.lines.filter((l) => leaving.has(l.studentId));
  if (!withdrawnLines.length) throw new UserError("None of those children are on this invoice.");

  const remainingLines = input.lines.filter((l) => !leaving.has(l.studentId));
  const remainingTotal = sum(remainingLines.map((l) => l.amount));
  const refund = Math.max(0, input.netPaid - remainingTotal);
  const stillOwing = Math.max(0, remainingTotal - input.netPaid);
  const grossPaid = input.netPaid + input.refundedSoFar;
  const cancel = grossPaid === 0 && remainingLines.length === 0;

  const allRefunds = input.refundedSoFar + refund;
  const paypalTotal = sum(input.lines.map((l) => l.amount)) + input.refundedSoFar;
  const paidInFull = grossPaid >= paypalTotal;
  const paypalItems =
    cancel || paidInFull
      ? []
      : [
          ...remainingLines.map((l) => ({ name: l.label, amount: l.amount })),
          ...(allRefunds > 0 ? [{ name: "Withdrawn – refunded", amount: allRefunds }] : []),
        ];

  const kidsBefore = new Set(input.lines.map((l) => l.studentId)).size;
  const kidsAfter = new Set(remainingLines.map((l) => l.studentId)).size;
  const minimum =
    input.minimum != null && stillOwing > 0 ? Math.min(Math.round((input.minimum * kidsAfter) / kidsBefore), stillOwing) : null;

  return {
    withdrawn: [...new Set(withdrawnLines.map((l) => l.firstName))],
    withdrawnIds: [...new Set(withdrawnLines.map((l) => l.studentId))],
    remainingLines,
    remainingTotal,
    refund,
    stillOwing,
    cancel,
    paypalItems,
    minimum,
    refundSteps: refundSteps(refund, input.payments),
  };
}

// PayPal payments are refunded back through PayPal first; anything paid another way
// (cash at the office, say) is handed back and recorded against the invoice.
function refundSteps(refund: Cents, payments: WithdrawalInput["payments"]): RefundStep[] {
  const steps: RefundStep[] = [];
  let left = refund;
  for (const p of payments.filter((p) => p.method === "PAYPAL")) {
    const amount = Math.min(left, p.amount - p.refunded);
    if (amount <= 0) continue;
    steps.push({ kind: "paypal", captureId: p.paymentId, amount });
    left -= amount;
  }
  if (left > 0) {
    const other = payments.find((p) => p.method !== "PAYPAL");
    steps.push({ kind: "record", method: other?.method ?? "OTHER", amount: left });
  }
  return steps;
}

function sum(xs: number[]) {
  return xs.reduce((n, x) => n + x, 0);
}
