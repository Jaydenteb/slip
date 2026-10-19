import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, statusAfterRefunds } from "./reconcile";

// Shapes taken from the day-1 sandbox spike.
const partlyPaid = {
  id: "INV2-Y7T8-BG72-6HUF-KAH2",
  status: "PARTIALLY_PAID",
  payments: {
    paid_amount: { currency_code: "AUD", value: "135.00" },
    transactions: [
      {
        payment_id: "EXTR-8VE48325LP7118057",
        payment_date: "2026-10-19",
        payment_date_time: "2026-10-19T00:00:00Z",
        method: "CASH",
        note: "Cash handed in at the office",
        amount: { currency_code: "AUD", value: "50.00" },
      },
      {
        payment_id: "04L99719K69849924",
        payment_date: "2026-10-18",
        payment_date_time: "2026-10-18T18:16:04Z",
        method: "PAYPAL",
        amount: { currency_code: "AUD", value: "85.00" },
      },
    ],
  },
};

test("maps a part-paid invoice with PayPal and cash payments", () => {
  const r = reconcile(partlyPaid);
  assert.equal(r.status, "PARTIALLY_PAID");
  assert.equal(r.amountPaid, 13500);
  assert.deepEqual(
    r.payments.map((p) => [p.paypalPaymentId, p.method, p.amount]),
    [
      ["EXTR-8VE48325LP7118057", "CASH", 5000],
      ["04L99719K69849924", "PAYPAL", 8500],
    ],
  );
  // The PayPal payment happened on 19 Oct in Melbourne, though PayPal's date says the 18th.
  assert.equal(r.payments[1].paidAt.toISOString(), "2026-10-18T18:16:04.000Z");
});

test("an unpaid sent invoice has no payments", () => {
  const r = reconcile({ id: "x", status: "UNPAID" });
  assert.equal(r.status, "SENT");
  assert.equal(r.amountPaid, 0);
  assert.deepEqual(r.payments, []);
});

test("statuses Slip doesn't track leave the invoice alone", () => {
  assert.equal(reconcile({ id: "x", status: "DRAFT" }).status, null);
});

test("marked-as-paid counts as paid", () => {
  assert.equal(reconcile({ id: "x", status: "MARKED_AS_PAID" }).status, "PAID");
});

test("refunds are taken off what's been paid", () => {
  // From the sandbox: $135 paid, then $20 refunded through PayPal and $10 in cash.
  const r = reconcile({ ...partlyPaid, status: "PARTIALLY_REFUNDED", refunds: { refund_amount: { currency_code: "AUD", value: "30.00" } } });
  assert.equal(r.amountPaid, 10500);
  assert.equal(r.amountRefunded, 3000);
});

test("a sibling still going keeps a paid or part-paid status after a refund", () => {
  assert.equal(statusAfterRefunds("PARTIALLY_REFUNDED", 28500, 28500), "PAID");
  assert.equal(statusAfterRefunds("PARTIALLY_REFUNDED", 28500, 8500), "PARTIALLY_PAID");
  assert.equal(statusAfterRefunds("PARTIALLY_REFUNDED", 28500, 0), "SENT");
  assert.equal(statusAfterRefunds("REFUNDED", 0, 0), "REFUNDED");
  assert.equal(statusAfterRefunds("PARTIALLY_PAID", 28500, 8500), "PARTIALLY_PAID");
});
