import type { Cents } from "../money";
import { paidTowardsPlan } from "../invoicing/plan";

// Who gets a payment reminder, and how firm it is. Plain rules, not the model: the
// model only writes the wording, and a person approves the batch before anything is sent.

export type ReminderTier = "gentle" | "overdue" | "final";

export const TIER_LABEL: Record<ReminderTier, string> = {
  gentle: "Friendly nudge",
  overdue: "Overdue",
  final: "Final reminder",
};

export function tierCount(tier: ReminderTier, n: number) {
  const noun = { gentle: "friendly nudge", overdue: "overdue reminder", final: "final reminder" }[tier];
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export type ReminderCandidate = {
  invoiceId: string;
  familyName: string;
  status: string;
  total: Cents;
  paid: Cents;
  minimum: Cents | null; // the deposit, as PayPal's minimum first payment
  plan: { dueOn: string; amount: Cents }[] | null;
  needsSupport: boolean; // the family has asked the office for help
  lastRemindedOn: string | null; // YYYY-MM-DD
};

export type EventDates = { depositDueOn: string | null; dueOn: string | null };

export type ChosenReminder = { invoiceId: string; familyName: string; owing: Cents; tier: ReminderTier; reason: string };
export type SkippedFamily = { familyName: string; reason: string };

const RESEND_AFTER_DAYS = 7;
const FINAL_AFTER_DAYS = 14;
const BALANCE_NUDGE_DAYS = 21;

export function chooseReminders(candidates: ReminderCandidate[], event: EventDates, today: string) {
  const chosen: ChosenReminder[] = [];
  const skipped: SkippedFamily[] = [];

  for (const c of candidates) {
    const owing = c.total - c.paid;
    if (owing <= 0 || !["SENT", "PARTIALLY_PAID"].includes(c.status)) continue;

    if (c.needsSupport) {
      skipped.push({ familyName: c.familyName, reason: "Asked for support: the office follows up personally" });
      continue;
    }
    if (c.lastRemindedOn && daysBetween(c.lastRemindedOn, today) < RESEND_AFTER_DAYS) {
      skipped.push({ familyName: c.familyName, reason: `Already reminded on ${day(c.lastRemindedOn)}` });
      continue;
    }

    const pick = c.plan
      ? onPlan(c.plan, paidTowardsPlan(c.plan.map((p) => p.amount), c.total, c.paid), today)
      : onDeadlines(c, event, today);
    if (!pick) {
      skipped.push({ familyName: c.familyName, reason: c.plan ? "Up to date with their payment plan" : "Nothing due yet" });
      continue;
    }
    chosen.push({ invoiceId: c.invoiceId, familyName: c.familyName, owing, ...pick });
  }

  return { chosen, skipped };
}

function onPlan(plan: { dueOn: string; amount: Cents }[], paid: Cents, today: string) {
  let expected = 0;
  let oldestMissed: string | null = null;
  for (const p of plan) {
    if (p.dueOn > today) break;
    expected += p.amount;
    if (paid < expected && !oldestMissed) oldestMissed = p.dueOn;
  }
  if (!oldestMissed) return null;
  return { tier: firmness(oldestMissed, today), reason: `Behind on their payment plan (instalment due ${day(oldestMissed)})` };
}

function onDeadlines(c: ReminderCandidate, event: EventDates, today: string) {
  if (event.dueOn && today > event.dueOn) {
    return { tier: firmness(event.dueOn, today), reason: `Balance was due ${day(event.dueOn)}` };
  }
  const depositOwed = c.minimum != null && c.paid < c.minimum;
  if (depositOwed && event.depositDueOn && today > event.depositDueOn) {
    return { tier: firmness(event.depositDueOn, today), reason: `Deposit was due ${day(event.depositDueOn)}` };
  }
  // Nothing paid yet: worth a friendly nudge whenever the deposit is due.
  if (depositOwed) {
    return { tier: "gentle" as const, reason: event.depositDueOn ? `Deposit due ${day(event.depositDueOn)}` : "Deposit not paid yet" };
  }
  // Deposit paid: leave them be until the balance is close.
  if (event.dueOn && daysBetween(today, event.dueOn) <= BALANCE_NUDGE_DAYS) {
    return { tier: "gentle" as const, reason: `Balance due ${day(event.dueOn)}` };
  }
  return null;
}

function firmness(dueOn: string, today: string): ReminderTier {
  return daysBetween(dueOn, today) > FINAL_AFTER_DAYS ? "final" : "overdue";
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function day(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
