// Drafts a reminder batch for the newest event, against Claude: npm run try-reminders -- [YYYY-MM-DD] [--dry]
// The date pretends it's another day (to see firmer wording); --dry rejects the batch afterwards.
import { db } from "../src/lib/db";
import { rejectApproval } from "../src/lib/executor/run";
import { proposeReminderBatch, type ReminderBatchPayload } from "../src/lib/reminders/service";

async function main() {
  const event = await db.event.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const today = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const started = Date.now();
  const item = await proposeReminderBatch(event.id, today);
  console.log(`drafted in ${((Date.now() - started) / 1000).toFixed(1)}s: ${item.title}\n${item.summary}\n`);
  const payload = item.payload as unknown as ReminderBatchPayload;
  for (const [tier, note] of Object.entries(payload.notes)) console.log(`[${tier}] ${note.subject}\n${note.note}\n`);
  for (const r of payload.reminders) console.log(`  ${r.familyName.padEnd(10)} ${r.tier.padEnd(8)} $${r.owing}  ${r.reason}`);
  for (const s of payload.skipped) console.log(`  ${s.familyName.padEnd(10)} skipped   ${s.reason}`);
  if (dry) {
    await rejectApproval(item.id, "office");
    console.log("\n--dry: rejected it again");
  } else console.log(`\nwaiting in Approvals: ${item.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
