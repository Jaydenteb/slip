import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseReminders, type ReminderCandidate } from "./select";

const event = { depositDueOn: "2026-12-01", dueOn: "2027-02-01" };
const family = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  invoiceId: "i1",
  familyName: "Kelly",
  status: "SENT",
  total: 28500,
  paid: 0,
  minimum: 8500,
  plan: null,
  needsSupport: false,
  lastRemindedOn: null,
  ...over,
});

test("nothing paid before the deposit date gets a friendly nudge", () => {
  const { chosen } = chooseReminders([family()], event, "2026-10-19");
  assert.deepEqual(chosen, [{ invoiceId: "i1", familyName: "Kelly", owing: 28500, tier: "gentle", reason: "Deposit due 1 Dec 2026" }]);
});

test("a missed deposit is overdue, then final after two weeks", () => {
  assert.equal(chooseReminders([family()], event, "2026-12-05").chosen[0].tier, "overdue");
  assert.equal(chooseReminders([family()], event, "2026-12-20").chosen[0].tier, "final");
});

test("deposit paid: left alone until the balance is close, then nudged, then overdue", () => {
  const paidDeposit = family({ status: "PARTIALLY_PAID", paid: 8500 });
  assert.deepEqual(chooseReminders([paidDeposit], event, "2026-12-05").chosen, []);
  assert.equal(chooseReminders([paidDeposit], event, "2026-12-05").skipped[0].reason, "Nothing due yet");
  assert.equal(chooseReminders([paidDeposit], event, "2027-01-20").chosen[0].tier, "gentle");
  assert.equal(chooseReminders([paidDeposit], event, "2027-02-03").chosen[0].tier, "overdue");
});

test("paid in full, cancelled or not yet sent: never reminded", () => {
  const { chosen, skipped } = chooseReminders(
    [family({ status: "PAID", paid: 28500 }), family({ status: "CANCELLED" }), family({ status: "PROPOSED" })],
    event,
    "2027-03-01",
  );
  assert.deepEqual(chosen, []);
  assert.deepEqual(skipped, []);
});

test("a family that asked for support is never chased by a reminder", () => {
  const { chosen, skipped } = chooseReminders([family({ needsSupport: true })], event, "2026-12-20");
  assert.deepEqual(chosen, []);
  assert.match(skipped[0].reason, /support/);
});

test("no second reminder within a week", () => {
  const recent = family({ lastRemindedOn: "2026-12-02" });
  assert.deepEqual(chooseReminders([recent], event, "2026-12-05").chosen, []);
  assert.equal(chooseReminders([recent], event, "2026-12-09").chosen.length, 1);
});

test("payment plans go by the instalments, not the event dates", () => {
  const plan = [
    { dueOn: "2026-10-26", amount: 14250 },
    { dueOn: "2026-11-02", amount: 14250 },
  ];
  const onTrack = family({ plan, paid: 14250, status: "PARTIALLY_PAID" });
  assert.deepEqual(chooseReminders([onTrack], event, "2026-10-30").chosen, []);
  assert.equal(chooseReminders([onTrack], event, "2026-10-30").skipped[0].reason, "Up to date with their payment plan");

  const behind = chooseReminders([onTrack], event, "2026-11-05").chosen[0];
  assert.equal(behind.tier, "overdue");
  assert.match(behind.reason, /2 Nov 2026/);
});

test("a deposit paid before the plan doesn't count towards its instalments", () => {
  // $285 owing, $85 deposit paid, then a plan for the $200 left: 2 x $100.
  const plan = [
    { dueOn: "2026-10-26", amount: 10000 },
    { dueOn: "2026-11-02", amount: 10000 },
  ];
  const r = chooseReminders([family({ plan, paid: 8500, status: "PARTIALLY_PAID" })], event, "2026-10-28").chosen[0];
  assert.ok(r, "behind on the first instalment");
  assert.match(r.reason, /26 Oct 2026/);
});
