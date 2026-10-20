// End-to-end check of the office flow against the real PayPal sandbox and Claude:
// describe → save → propose invoice batch → approve → executor sends through the gate.
//   npm run e2e:office
import { db } from "../src/lib/db";
import { parseEventDescription } from "../src/lib/events/parse";
import { proposeInvoiceBatch, saveEvent } from "../src/lib/events/service";
import { approveAndExecute } from "../src/lib/executor/run";
import { DEMO_SCHOOL_ID } from "../src/lib/demo/seed";

const TEXT =
  "Year 4 camp at Bellbird Creek, 12–14 March, $285, $85 deposit by 1 December, balance by 1 February, needs consent.";

async function main() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const parsed = await parseEventDescription(TEXT, today);
  console.log("parsed:", parsed.title, parsed.fees);

  const event = await saveEvent({ ...parsed, sourceText: TEXT }, DEMO_SCHOOL_ID);
  const enrolled = await db.enrolment.count({ where: { eventId: event.id } });
  console.log(`saved event ${event.id} with ${enrolled} students`);

  const approval = await proposeInvoiceBatch(event.id);
  console.log("proposed:", approval.title, "\n ", approval.summary);

  const before = await db.agentAction.count({ where: { approvalItemId: approval.id, action: { startsWith: "paypal." } } });
  console.log(`PayPal calls before approval: ${before}`);

  const started = Date.now();
  await approveAndExecute(approval.id, "office");
  console.log(`approved and sent in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const invoices = await db.invoice.findMany({ where: { eventId: event.id }, include: { family: true, lines: true } });
  for (const inv of invoices) {
    console.log(
      `  ${inv.family.familyName.padEnd(10)} ${String(inv.lines.length)} kid(s)  $${inv.total}  min $${inv.minimumPayment}  ${inv.status}  ${inv.paypalInvoiceId}`,
    );
  }
  const calls = await db.agentAction.groupBy({ by: ["action", "ok"], where: { approvalItemId: approval.id }, _count: true });
  console.log("audit log:", calls.map((c) => `${c.action}${c.ok ? "" : " (failed)"} ×${c._count}`).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
