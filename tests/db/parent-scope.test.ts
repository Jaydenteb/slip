// The parent chat's tools must only ever see and touch the family whose link it is.
// Runs against a real Postgres (DATABASE_URL), in its own throwaway school.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { familyTools } from "../../src/lib/agent/parent";

const SCHOOL = `test-scope-${Date.now()}`;
let familyA: string;
let familyB: string;
let invoiceA: string;
let invoiceB: string;

function tool(familyId: string, name: string) {
  const t = familyTools(familyId).find((x) => x.name === name);
  assert.ok(t, `tool ${name} exists`);
  // Call it the way the tool runner does: with the model's JSON input.
  return t as unknown as { run: (args: object) => Promise<unknown> };
}

before(async () => {
  await db.school.create({ data: { id: SCHOOL, name: "Test Primary", email: "office@example.com" } });
  const room = await db.classroom.create({ data: { schoolId: SCHOOL, name: "4A", year: 4 } });
  const mk = async (surname: string, kid: string) =>
    db.family.create({
      data: {
        schoolId: SCHOOL,
        familyName: surname,
        contactName: `Alex ${surname}`,
        linkToken: `${SCHOOL}-${surname}`,
        students: { create: { firstName: kid, lastName: surname, classroomId: room.id } },
      },
      include: { students: true },
    });
  const a = await mk("Able", "Ada");
  const b = await mk("Baker", "Bo");
  familyA = a.id;
  familyB = b.id;

  const event = await db.event.create({
    data: {
      schoolId: SCHOOL,
      title: "Zoo trip",
      description: "A day at the zoo.",
      sourceText: "Zoo trip, $40",
      classroomIds: [room.id],
      feeItems: { create: { label: "Zoo trip", amount: "40.00" } },
    },
  });
  const inv = async (familyId: string, studentId: string) =>
    db.invoice.create({
      data: {
        eventId: event.id,
        familyId,
        status: "SENT",
        paypalInvoiceId: `INV2-TEST-${familyId}`,
        total: "40.00",
        lines: { create: { studentId, label: "Zoo trip", amount: "40.00" } },
      },
    });
  invoiceA = (await inv(a.id, a.students[0].id)).id;
  invoiceB = (await inv(b.id, b.students[0].id)).id;
});

after(async () => {
  await db.agentAction.deleteMany({ where: { schoolId: SCHOOL } });
  await db.approvalItem.deleteMany({ where: { schoolId: SCHOOL } });
  await db.school.delete({ where: { id: SCHOOL } });
  await db.$disconnect();
});

test("the overview only contains this family's children and invoices", async () => {
  const out = JSON.parse(String(await tool(familyA, "get_family_overview").run({})));
  assert.deepEqual(
    out.children.map((c: { name: string }) => c.name),
    ["Ada"],
  );
  assert.deepEqual(
    out.events.map((e: { invoiceId: string }) => e.invoiceId),
    [invoiceA],
  );
  const text = JSON.stringify(out);
  assert.ok(!text.includes("Baker") && !text.includes("Bo") && !text.includes(invoiceB));
});

test("a family can't request a payment plan on another family's invoice", async () => {
  const reply = await tool(familyA, "request_payment_plan").run({
    invoiceId: invoiceB,
    instalments: 2,
    frequency: "weekly",
    parentNote: null,
  });
  assert.match(String(reply), /isn't open/);
  assert.equal(await db.approvalItem.count({ where: { schoolId: SCHOOL } }), 0);
});

test("a plan request only creates an approval: no PayPal call", async () => {
  await tool(familyA, "request_payment_plan").run({ invoiceId: invoiceA, instalments: 2, frequency: "weekly", parentNote: null });
  const items = await db.approvalItem.findMany({ where: { schoolId: SCHOOL } });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "PAYMENT_PLAN");
  assert.equal(items[0].status, "PENDING");
  assert.equal(items[0].familyId, familyA);
  assert.equal(await db.agentAction.count({ where: { schoolId: SCHOOL, action: { startsWith: "paypal." } } }), 0);
});

test("a support flag is recorded against this family only", async () => {
  await tool(familyB, "flag_for_support").run({ summary: "Parent says money is tight." });
  const flags = await db.approvalItem.findMany({ where: { schoolId: SCHOOL, kind: "HARDSHIP_FLAG" } });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].familyId, familyB);
});

test("a family can't withdraw another family's child", async () => {
  const before = await db.approvalItem.count({ where: { schoolId: SCHOOL, kind: "REFUND" } });
  const other = await tool(familyA, "request_withdrawal").run({ invoiceId: invoiceB, children: ["Bo"], reason: null });
  assert.match(String(other), /can't be changed/);
  const notTheirs = await tool(familyA, "request_withdrawal").run({ invoiceId: invoiceA, children: ["Bo"], reason: null });
  assert.match(String(notTheirs), /None of those children/);
  assert.equal(await db.approvalItem.count({ where: { schoolId: SCHOOL, kind: "REFUND" } }), before);
});

test("a withdrawal request only creates an approval: no PayPal call", async () => {
  const reply = await tool(familyA, "request_withdrawal").run({ invoiceId: invoiceA, children: ["ada"], reason: "Can't attend" });
  assert.match(String(reply), /Sent to the office/);
  const item = await db.approvalItem.findFirstOrThrow({ where: { schoolId: SCHOOL, kind: "REFUND" } });
  assert.equal(item.status, "PENDING");
  assert.equal(item.familyId, familyA);
  assert.match(item.summary, /cancelled/); // nothing paid, only child: the invoice is cancelled
  assert.equal(await db.agentAction.count({ where: { schoolId: SCHOOL, action: { startsWith: "paypal." } } }), 0);
});
