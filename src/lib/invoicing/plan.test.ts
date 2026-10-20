import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, buildPlan, paidTowardsPlan } from "./plan";

test("weekly plan splits the balance exactly", () => {
  const plan = buildPlan(57000, 4, "weekly", "2026-10-26");
  assert.deepEqual(plan, [
    { dueOn: "2026-10-26", amount: 14250 },
    { dueOn: "2026-11-02", amount: 14250 },
    { dueOn: "2026-11-09", amount: 14250 },
    { dueOn: "2026-11-16", amount: 14250 },
  ]);
});

test("odd cents go on the last instalment, so the first (PayPal's minimum) is never the biggest", () => {
  const plan = buildPlan(20000, 3, "fortnightly", "2026-12-01");
  assert.deepEqual(
    plan.map((p) => p.amount),
    [6666, 6666, 6668],
  );
  assert.equal(plan[2].dueOn, "2026-12-29");
});

test("monthly plans cross the new year", () => {
  const plan = buildPlan(30000, 3, "monthly", "2026-11-15");
  assert.deepEqual(
    plan.map((p) => p.dueOn),
    ["2026-11-15", "2026-12-15", "2027-01-15"],
  );
});

test("refuses silly plans", () => {
  assert.throws(() => buildPlan(0, 3, "weekly", "2026-11-01"));
  assert.throws(() => buildPlan(10000, 1, "weekly", "2026-11-01"));
  assert.throws(() => buildPlan(10000, 20, "weekly", "2026-11-01"));
});

test("addDays", () => {
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
});

test("monthly plans keep to the end of short months", () => {
  const plan = buildPlan(40000, 4, "monthly", "2027-01-31");
  assert.deepEqual(
    plan.map((p) => p.dueOn),
    ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"],
  );
});

test("money paid before a plan doesn't count towards it", () => {
  // $285 invoice, $85 deposit paid, then 2 x $100 for the rest.
  assert.equal(paidTowardsPlan([10000, 10000], 28500, 8500), 0);
  assert.equal(paidTowardsPlan([10000, 10000], 28500, 18500), 10000);
});
