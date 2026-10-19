// zod v4 API (the SDK's helpers need it); the root "zod" export is v3 for the PayPal toolkit.
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, FALLBACK, MODEL, RefusedError } from "../ai/claude";

// What the office's plain-English description becomes. Shown on a review screen
// before anything is saved, so the office can fix whatever Slip got wrong.
export const ParsedEventSchema = z.object({
  title: z.string().describe("Short title, e.g. 'Year 4 Camp – Bellbird Creek'"),
  summary: z
    .string()
    .describe("One or two friendly sentences for parents describing the event"),
  location: z.string().nullable(),
  startsOn: z.string().nullable().describe("YYYY-MM-DD"),
  endsOn: z.string().nullable().describe("YYYY-MM-DD; same as startsOn for a one-day event"),
  yearLevels: z.array(z.number().int()).describe("Year levels invited, e.g. [4]"),
  classNames: z
    .array(z.string())
    .describe("Specific classes named, e.g. ['4B']; empty if the whole year level is invited"),
  needsConsent: z.boolean(),
  fees: z.array(
    z.object({
      label: z.string().describe("e.g. 'Camp fee'"),
      amount: z.number().describe("Full amount per student in dollars"),
      deposit: z.number().nullable().describe("Deposit per student in dollars, if one is mentioned"),
      depositDueOn: z.string().nullable().describe("YYYY-MM-DD"),
      dueOn: z.string().nullable().describe("YYYY-MM-DD when the full amount is due"),
    }),
  ),
  assumptions: z
    .array(z.string())
    .describe("Each guess you made, in plain words, so the office can check it"),
  questions: z
    .array(z.string())
    .describe("Anything you couldn't work out and the office needs to answer"),
});

export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

const SYSTEM = `You help a primary school office set up payments for field trips, camps and fundraisers.
Turn the office's description into the event details. Only use what they wrote: never invent a fee, a date or a class.
Dates: resolve to the next occurrence on or after today unless a year is given, and record that as an assumption.
Health and medical information is never collected through this system. If the description mentions medical forms, treat it as needing consent and add an assumption that medical details are collected separately by the school.
Money is in the school's currency; amounts are per student.
Parents pay with PayPal and give consent by ticking a box on their family page, so the note for parents should ask them to give consent there, never to return a paper or signed form.`;

export async function parseEventDescription(text: string, today: string): Promise<ParsedEvent> {
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ParsedEventSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Today is ${today}.\n\nEvent description:\n${text}` }],
  });

  if (response.stop_reason === "refusal") throw new RefusedError(response.stop_details?.category);
  if (!response.parsed_output) throw new Error(`Couldn't read the event details (stop: ${response.stop_reason})`);
  return response.parsed_output;
}
