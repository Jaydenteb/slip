import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceDrafts } from "./build";
import { allocate, toCents, fromCents, splitInstalments } from "../money";

const camp = [{ label: "Year 4 camp", amount: 28500, deposit: 8500 }];

test("siblings on the same event share one invoice", () => {
  const drafts = buildInvoiceDrafts(
    [
      { studentId: "s1", firstName: "Ava", familyId: "f1", attending: true },
      { studentId: "s2", firstName: "Leo", familyId: "f1", attending: true },
      { studentId: "s3", firstName: "Mia", familyId: "f2", attending: true },
    ],
    camp,
  );
  assert.equal(drafts.length, 2);
  const f1 = drafts.find((d) => d.familyId === "f1")!;
  assert.equal(f1.lines.length, 2);
  assert.equal(f1.total, 57000);
  assert.equal(f1.minimumPayment, 17000); // a deposit for each child
});

test("students not attending aren't billed", () => {
  const drafts = buildInvoiceDrafts(
    [{ studentId: "s1", firstName: "Ava", familyId: "f1", attending: false }],
    camp,
  );
  assert.deepEqual(drafts, []);
});

test("no deposit means pay in full", () => {
  const [d] = buildInvoiceDrafts(
    [{ studentId: "s1", firstName: "Ava", familyId: "f1", attending: true }],
    [{ label: "Zoo trip", amount: 3500 }],
  );
  assert.equal(d.minimumPayment, null);
});

test("money round-trips through cents", () => {
  assert.equal(toCents("285"), 28500);
  assert.equal(toCents("85.5"), 8550);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(fromCents(28500), "285.00");
  assert.equal(fromCents(5), "0.05");
  assert.throws(() => toCents("1.234"));
});

test("instalments add up exactly, leftovers on the last (the first is PayPal's minimum)", () => {
  const parts = splitInstalments(28500, 4);
  assert.deepEqual(parts, [7125, 7125, 7125, 7125]);
  const odd = splitInstalments(10000, 3);
  assert.deepEqual(odd, [3333, 3333, 3334]);
  assert.equal(odd.reduce((a, b) => a + b, 0), 10000);
});

test("a payment split across siblings adds up to the cent", () => {
  assert.deepEqual(allocate(8501, [28500, 28500]), [4251, 4250]);
  assert.deepEqual(allocate(10000, [1, 1, 1]), [3334, 3333, 3333]);
  assert.deepEqual(allocate(500, [0, 0]), [0, 0]);
});
