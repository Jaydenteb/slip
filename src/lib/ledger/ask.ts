import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, FALLBACK, MODEL, RefusedError } from "../ai/claude";
import { LEDGER_COLUMNS, LEDGER_STATUSES, type LedgerRow } from "./columns";
import { LedgerQuerySchema, type LedgerQuery } from "./query";

const SYSTEM = `You turn a school office's question about payments into a view of their ledger grid.
Each row is one student on one event. Use only these columns:
${Object.entries(LEDGER_COLUMNS)
  .map(([id, c]) => `- ${id} (${c.kind}): ${c.about}`)
  .join("\n")}

Rules:
- Use exact values from the lists you're given for event, className and status. For an event, prefer "contains" with a distinctive word from its title.
- "Hasn't paid" usually means status is not Paid (and not Cancelled or Refunded). "Hasn't paid the deposit" means depositPaid equals No.
- Sort so the rows the office most needs to act on come first.
- Choose a handful of columns that answer the question; always include what you filter on.
- If the question asks to show everything or reset, return no filters, no sort, columns null and groupBy null.
- If the question can't be answered from these columns, return no filters and explain what the ledger can show instead.`;

export async function askLedger(question: string, rows: LedgerRow[], today: string): Promise<LedgerQuery> {
  const distinct = (key: "event" | "className") => [...new Set(rows.map((r) => r[key]))].sort();
  const context = [
    `Today is ${today}.`,
    `Events: ${distinct("event").join("; ") || "none yet"}`,
    `Classes: ${distinct("className").join(", ")}`,
    `Statuses: ${LEDGER_STATUSES.join(", ")}`,
  ].join("\n");

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(LedgerQuerySchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `${context}\n\nQuestion: ${question}` }],
  });
  if (response.stop_reason === "refusal") throw new RefusedError(response.stop_details?.category);
  if (!response.parsed_output) throw new Error(`Couldn't work that out (stop: ${response.stop_reason})`);
  return response.parsed_output;
}
