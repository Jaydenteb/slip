import { splitInstalments, type Cents } from "../money";

export type Frequency = "weekly" | "fortnightly" | "monthly";

export type Instalment = { dueOn: string; amount: Cents };

const DAYS: Record<Exclude<Frequency, "monthly">, number> = { weekly: 7, fortnightly: 14 };

// Splits what's still owing into equal instalments, the first due `firstDueOn`.
// Dates are calendar days (YYYY-MM-DD); maths happens in UTC so time zones can't shift them.
export function buildPlan(owing: Cents, count: number, frequency: Frequency, firstDueOn: string): Instalment[] {
  if (owing <= 0) throw new Error("Nothing is owing on this invoice");
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new Error("A plan has between 2 and 12 instalments");
  const amounts = splitInstalments(owing, count);
  const start = new Date(`${firstDueOn}T00:00:00Z`);
  return amounts.map((amount, i) => {
    const d = new Date(start);
    if (frequency === "monthly") d.setUTCMonth(d.getUTCMonth() + i);
    else d.setUTCDate(d.getUTCDate() + DAYS[frequency] * i);
    return { dueOn: d.toISOString().slice(0, 10), amount };
  });
}

export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
