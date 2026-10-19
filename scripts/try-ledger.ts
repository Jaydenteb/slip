// Tries "Ask the ledger" on a few questions against the local data: npm run try-ledger
import { db } from "../src/lib/db";
import { DEMO_SCHOOL_ID } from "../src/lib/demo/seed";
import { askLedger } from "../src/lib/ledger/ask";
import { toGridState } from "../src/lib/ledger/query";
import { loadLedgerRows } from "../src/lib/ledger/rows";

const QUESTIONS = process.argv.slice(2).length
  ? [process.argv.slice(2).join(" ")]
  : [
      "Who in 4B hasn't paid the camp deposit yet?",
      "Which families owe more than $200, biggest first?",
      "Show me everyone on a payment plan or who needs support",
      "Who paid cash?",
    ];

async function main() {
  const rows = await loadLedgerRows(DEMO_SCHOOL_ID);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  for (const q of QUESTIONS) {
    const started = Date.now();
    const query = await askLedger(q, rows, today);
    const state = toGridState(query, { canGroup: false });
    console.log(`\nQ: ${q}  (${((Date.now() - started) / 1000).toFixed(1)}s)\n  ${query.explanation}`);
    console.log("  filters:", JSON.stringify(state.filterModel));
    console.log("  sort:", state.columnState.filter((c) => c.sort).map((c) => `${c.colId} ${c.sort}`).join(", ") || "none");
    if (state.skipped.length) console.log("  skipped:", state.skipped);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
