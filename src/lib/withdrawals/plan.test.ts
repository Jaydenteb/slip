import { test } from "node:test";
import assert from "node:assert/strict";
import { planWithdrawal, type WithdrawalInput } from "./plan";

const nguyen: WithdrawalInput["lines"] = [
  { studentId: "ava", firstName: "Ava", label: "Camp fee – Ava", amount: 28500 },
  { studentId: "leo", firstName: "Leo", label: "Camp fee – Leo", amount: 28500 },
];
const base = { lines: nguyen, withdraw: ["leo"], netPaid: 0, refundedSoFar: 0, minimum: 17000, payments: [] };

test("nothing paid, one sibling withdrawn: the invoice drops to the other child", () => {
  const p = planWithdrawal(base);
  assert.equal(p.remainingTotal, 28500);
  assert.equal(p.refund, 0);
  assert.equal(p.stillOwing, 28500);
  assert.equal(p.cancel, false);
  assert.deepEqual(p.paypalItems, [{ name: "Camp fee – Ava", amount: 28500 }]);
  assert.equal(p.minimum, 8500); // one child's deposit now
  assert.deepEqual(p.refundSteps, []);
});

test("deposit paid for both: it now counts toward the child still going, no refund", () => {
  const p = planWithdrawal({ ...base, netPaid: 17000, payments: [{ paymentId: "CAP1", method: "PAYPAL", amount: 17000, refunded: 0 }] });
  assert.equal(p.refund, 0);
  assert.equal(p.stillOwing, 11500);
});

test("paid in full: the withdrawn child's share comes back through PayPal", () => {
  const p = planWithdrawal({ ...base, netPaid: 57000, payments: [{ paymentId: "CAP1", method: "PAYPAL", amount: 57000, refunded: 0 }] });
  assert.equal(p.refund, 28500);
  assert.equal(p.stillOwing, 0);
  assert.equal(p.minimum, null);
  assert.deepEqual(p.refundSteps, [{ kind: "paypal", captureId: "CAP1", amount: 28500 }]);
  // PayPal won't edit a paid invoice; the refund alone settles it.
  assert.deepEqual(p.paypalItems, []);
});

test("part paid beyond what's still owed: the invoice is cut down and the extra refunded", () => {
  const p = planWithdrawal({ ...base, lines: [...nguyen, { studentId: "mia", firstName: "Mia", label: "Camp fee – Mia", amount: 28500 }], withdraw: ["leo", "mia"], netPaid: 40000, payments: [{ paymentId: "CAP1", method: "PAYPAL", amount: 40000, refunded: 0 }] });
  assert.equal(p.refund, 11500);
  // PayPal still counts refunded money as paid, so its invoice keeps a line for it.
  assert.deepEqual(p.paypalItems, [
    { name: "Camp fee – Ava", amount: 28500 },
    { name: "Withdrawn – refunded", amount: 11500 },
  ]);
});

test("PayPal payments are refunded first, then cash is handed back and recorded", () => {
  const p = planWithdrawal({
    ...base,
    lines: [nguyen[0]],
    withdraw: ["ava"],
    netPaid: 13500,
    payments: [
      { paymentId: "CAP1", method: "PAYPAL", amount: 8500, refunded: 0 },
      { paymentId: "EXTR-1", method: "CASH", amount: 5000, refunded: 0 },
    ],
  });
  assert.equal(p.refund, 13500);
  assert.equal(p.remainingTotal, 0);
  assert.equal(p.cancel, false);
  assert.deepEqual(p.refundSteps, [
    { kind: "paypal", captureId: "CAP1", amount: 8500 },
    { kind: "record", method: "CASH", amount: 5000 },
  ]);
});

test("a capture that's already been refunded isn't refunded twice", () => {
  const p = planWithdrawal({
    ...base,
    lines: [nguyen[0]],
    withdraw: ["ava"],
    netPaid: 6500,
    refundedSoFar: 2000,
    payments: [{ paymentId: "CAP1", method: "PAYPAL", amount: 8500, refunded: 2000 }],
  });
  assert.deepEqual(p.refundSteps, [{ kind: "paypal", captureId: "CAP1", amount: 6500 }]);
  assert.deepEqual(p.paypalItems, [{ name: "Withdrawn – refunded", amount: 8500 }]); // $85 of a $285 invoice paid
});

test("whole family withdrawn before paying anything: cancel the invoice", () => {
  const p = planWithdrawal({ ...base, withdraw: ["ava", "leo"] });
  assert.equal(p.cancel, true);
  assert.equal(p.refund, 0);
  assert.deepEqual(p.withdrawn, ["Ava", "Leo"]);
});

test("refuses a child who isn't on the invoice", () => {
  assert.throws(() => planWithdrawal({ ...base, withdraw: ["someone-else"] }));
});

test("ids that aren't on the invoice are ignored, so another family's child can't be withdrawn", () => {
  const p = planWithdrawal({ ...base, withdraw: ["leo", "someone-else"] });
  assert.deepEqual(p.withdrawnIds, ["leo"]);
  assert.deepEqual(p.withdrawn, ["Leo"]);
});
