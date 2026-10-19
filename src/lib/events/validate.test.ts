import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfirmedEvent } from "./validate";

const camp = {
  title: "Year 4 Camp – Bellbird Creek",
  summary: "Three days at Bellbird Creek Camp.",
  location: "Bellbird Creek Camp",
  startsOn: "2027-03-12",
  endsOn: "2027-03-14",
  yearLevels: [4],
  classNames: [],
  needsConsent: true,
  fees: [{ label: "Camp fee", amount: 285, deposit: 85, depositDueOn: "2026-12-01", dueOn: "2027-02-01" }],
  assumptions: [],
  questions: [],
  sourceText: "Year 4 camp...",
};
const withFee = (fee: object) => ({ ...camp, fees: [{ ...camp.fees[0], ...fee }] });

test("a normal camp passes", () => {
  assert.equal(validateConfirmedEvent(camp).ok, true);
});

test("negative, zero and huge amounts are refused", () => {
  for (const amount of [-285, 0, 1_000_000]) assert.equal(validateConfirmedEvent(withFee({ amount })).ok, false);
  assert.equal(validateConfirmedEvent(withFee({ deposit: 0 })).ok, false);
});

test("a deposit bigger than the fee is refused", () => {
  const r = validateConfirmedEvent(withFee({ deposit: 300 }));
  assert.deepEqual(r, { ok: false, error: "A deposit can't be more than the fee." });
});

test("bad dates, long text and the wrong shape are refused", () => {
  assert.equal(validateConfirmedEvent({ ...camp, startsOn: "12 March" }).ok, false);
  assert.equal(validateConfirmedEvent({ ...camp, title: "x".repeat(500) }).ok, false);
  assert.equal(validateConfirmedEvent({ ...camp, fees: "free" }).ok, false);
  assert.equal(validateConfirmedEvent(null).ok, false);
});
