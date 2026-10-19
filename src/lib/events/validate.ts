import { z } from "zod/v4";
import type { ConfirmedEvent } from "./service";

// The event as the office confirmed it on the review screen. It arrives from the browser,
// so it's checked again here: sensible lengths, real dates and amounts a camp could cost.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates need to be real dates.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Dates need to be real dates.");
const text = (max: number, what: string) => z.string().trim().max(max, `${what} is too long (${max} characters at most).`);
const dollars = (what: string) =>
  z.number(`${what} needs to be a number.`).positive(`${what} needs to be more than $0.`).max(10_000, `${what} looks too big.`);

export const ConfirmedEventSchema = z.object({
  title: text(120, "The title").min(1, "Give the event a title."),
  summary: text(600, "The note for parents"),
  location: text(120, "The place").nullable(),
  startsOn: day.nullable(),
  endsOn: day.nullable(),
  yearLevels: z.array(z.number().int().min(0).max(12)).max(13),
  classNames: z.array(text(20, "A class name")).max(40),
  needsConsent: z.boolean(),
  fees: z
    .array(
      z
        .object({
          label: text(80, "A fee name").min(1, "Give each fee a name."),
          amount: dollars("The fee"),
          deposit: dollars("The deposit").nullable(),
          depositDueOn: day.nullable(),
          dueOn: day.nullable(),
        })
        .refine((f) => f.deposit == null || f.deposit <= f.amount, "A deposit can't be more than the fee."),
    )
    .min(1, "Add at least one fee.")
    .max(5, "Five fees at most."),
  assumptions: z.array(text(400, "An assumption")).max(20),
  questions: z.array(text(400, "A question")).max(20),
  sourceText: text(2000, "The description"),
});

export type ValidationResult = { ok: true; event: ConfirmedEvent } | { ok: false; error: string };

export function validateConfirmedEvent(input: unknown): ValidationResult {
  const parsed = ConfirmedEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the event details." };
  return { ok: true, event: parsed.data };
}
