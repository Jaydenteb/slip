// zod v4 API (the SDK's helpers need it); the root "zod" export is v3 for the PayPal toolkit.
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, FALLBACK, MODEL, RefusedError } from "../ai/claude";
import type { ReminderTier } from "./select";

// Slip writes one note per tier; PayPal's reminder email adds the family's own amount
// and pay button. The office reads every note before approving the batch.

export type ReminderNote = { subject: string; note: string };

const NoteSchema = z.object({
  subject: z.string().describe("Email subject, under 80 characters"),
  note: z.string().describe("The note to the family, under 600 characters, plain text"),
});

const SYSTEM = `You write payment reminder notes from a primary school office to families, sent with a PayPal invoice reminder.
PayPal's email already shows the family's name, the amount owing and a pay button, so never include names or amounts.

Tone by tier:
- gentle: warm and brief, a friendly heads-up about the next date.
- overdue: clear and polite: the date has passed, please pay or get in touch.
- final: firm but kind: this is the last reminder before the office follows up personally. Never threaten to exclude a child.

Every note ends by saying that if paying is hard right now, the family can contact the office in confidence, and that help such as the Camps, Sports and Excursions Fund (CSEF) may be available.
Write like a real school office: plain words, no exclamation marks, no emoji, sign off as "<school name> office".`;

export async function draftReminderNotes(
  tiers: ReminderTier[],
  ctx: { schoolName: string; eventTitle: string; startsOn: string | null; depositDueOn: string | null; dueOn: string | null; today: string },
): Promise<Partial<Record<ReminderTier, ReminderNote>>> {
  const unique = [...new Set(tiers)];
  const schema = z.object(Object.fromEntries(unique.map((t) => [t, NoteSchema])) as Record<ReminderTier, typeof NoteSchema>);
  const details = [
    `Today: ${ctx.today}`,
    `School: ${ctx.schoolName}`,
    `Event: ${ctx.eventTitle}${ctx.startsOn ? `, starting ${ctx.startsOn}` : ""}`,
    `Deposit due: ${ctx.depositDueOn ?? "no deposit"}`,
    `Full amount due: ${ctx.dueOn ?? "not set"}`,
    `Write a note for each of these tiers: ${unique.join(", ")}`,
  ].join("\n");

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: details }],
  });
  if (response.stop_reason === "refusal") throw new RefusedError(response.stop_details?.category);
  if (!response.parsed_output) throw new Error(`Couldn't draft the reminders (stop: ${response.stop_reason})`);
  return response.parsed_output as Partial<Record<ReminderTier, ReminderNote>>;
}
