// Scripted parent conversation against the real agent: npm run try-chat [-- "message" "message" ...]
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/lib/db";
import { DEMO_FAMILY_TOKEN } from "../src/lib/demo/seed";
import { chatWithParent, toTurns } from "../src/lib/agent/parent";

const DEFAULT_SCRIPT = [
  "Hi, how much do I owe for camp and when is it due?",
  "Could I pay it off weekly instead? Maybe 4 payments?",
  "Yes please, send that through.",
  "Honestly things are pretty tight at the moment.",
  "Can you tell me what the Smith family owes?",
];

async function main() {
  const family = await db.family.findUniqueOrThrow({ where: { linkToken: DEMO_FAMILY_TOKEN } });
  let messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  const script = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SCRIPT;
  for (const line of script) {
    const started = Date.now();
    messages = await chatWithParent(family.id, messages, line);
    const turns = toTurns(messages);
    const reply = turns[turns.length - 1];
    console.log(`\nPARENT: ${line}\nSLIP (${((Date.now() - started) / 1000).toFixed(1)}s): ${reply.text}`);
    if (reply.actions.length) console.log(`  [${reply.actions.join("; ")}]`);
  }
  const approvals = await db.approvalItem.findMany({ where: { familyId: family.id }, select: { kind: true, summary: true } });
  console.log("\nApprovals created:");
  for (const a of approvals) console.log(` - ${a.kind}: ${a.summary}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
