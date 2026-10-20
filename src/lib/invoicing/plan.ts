import { splitInstalments, type Cents } from "../money";
import { UserError } from "../errors";

export type Frequency = "weekly" | "fortnightly" | "monthly";

export type Instalment = { dueOn: string; amount: Cents };

const DAYS: Record<Exclude<Frequency, "monthly">, number> = { weekly: 7, fortnightly: 14 };

// Splits what's still owing into equal instalments, the first due `firstDueOn`.
// Dates are calendar days (YYYY-MM-DD); maths happens in UTC so time zones can't shift them.
export function buildPlan(owing: Cents, count: number, frequency: Frequency, firstDueOn: string): Instalment[] {
  if (owing <= 0) throw new UserError("Nothing is owing on this invoice");
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new UserError("A plan has between 2 and 12 instalments");
  const amounts = splitInstalments(owing, count);
  const start = new Date(`${firstDueOn}T00:00:00Z`);
  return amounts.map((amount, i) => {
    const d = frequency === "monthly" ? addMonths(start, i) : new Date(start.getTime() + DAYS[frequency] * i * 86_400_000);
    return { dueOn: d.toISOString().slice(0, 10), amount };
  });
}

// Same day next month, or the month's last day if it's shorter (31 Jan, then 28 Feb).
function addMonths(start: Date, months: number) {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

// A plan splits what was owing when it was agreed, so money paid before that (the
// deposit, say) doesn't count towards its instalments.
export function paidTowardsPlan(instalments: Cents[], total: Cents, paid: Cents): Cents {
  const paidBefore = total - instalments.reduce((n, a) => n + a, 0);
  return Math.max(0, paid - paidBefore);
}

export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
