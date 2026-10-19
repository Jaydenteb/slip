import { test } from "node:test";
import assert from "node:assert/strict";
import { createGatedPayPal, GateError, type ApprovalSnapshot, type AuditEntry } from "./gate";

function setup(item: ApprovalSnapshot | null) {
  const calls: string[] = [];
  const audits: AuditEntry[] = [];
  const run = createGatedPayPal({
    getApproval: async () => item,
    runTool: async (tool) => {
      calls.push(tool);
      return { ok: true };
    },
    audit: async (entry) => {
      audits.push(entry);
    },
  });
  return { run, calls, audits };
}

const base = { id: "a1", schoolId: "s1", kind: "INVOICE_BATCH" } as const;

test("refuses without an approval item id", async () => {
  const { run, calls } = setup({ ...base, status: "EXECUTING" });
  await assert.rejects(run("", "send_invoice", {}), GateError);
  assert.deepEqual(calls, []);
});

test("refuses when the approval item doesn't exist", async () => {
  const { run, calls } = setup(null);
  await assert.rejects(run("a1", "send_invoice", {}), GateError);
  assert.deepEqual(calls, []);
});

for (const status of ["PENDING", "APPROVED", "REJECTED", "EXECUTED", "FAILED"] as const) {
  test(`refuses when the approval is ${status}`, async () => {
    const { run, calls } = setup({ ...base, status });
    await assert.rejects(run("a1", "send_invoice", {}), GateError);
    assert.deepEqual(calls, []);
  });
}

test("refuses a tool that isn't allowed for the approval kind", async () => {
  const { run, calls } = setup({ ...base, kind: "REMINDER_BATCH", status: "EXECUTING" });
  await assert.rejects(run("a1", "record_refund_for_invoice", {}), GateError);
  assert.deepEqual(calls, []);
});

test("hardship flags can never trigger PayPal", async () => {
  const { run, calls } = setup({ ...base, kind: "HARDSHIP_FLAG", status: "EXECUTING" });
  await assert.rejects(run("a1", "send_invoice", {}), GateError);
  assert.deepEqual(calls, []);
});

test("runs an allowed tool for an executing approval and audits it", async () => {
  const { run, calls, audits } = setup({ ...base, status: "EXECUTING" });
  await run("a1", "send_invoice", { invoice_id: "INV2-1" });
  assert.deepEqual(calls, ["send_invoice"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "paypal.send_invoice");
  assert.equal(audits[0].ok, true);
});

test("audits failed PayPal calls too", async () => {
  const audits: AuditEntry[] = [];
  const run = createGatedPayPal({
    getApproval: async () => ({ ...base, status: "EXECUTING" }),
    runTool: async () => {
      throw new Error("boom");
    },
    audit: async (e) => {
      audits.push(e);
    },
  });
  await assert.rejects(run("a1", "send_invoice", {}), /boom/);
  assert.equal(audits[0].ok, false);
});
