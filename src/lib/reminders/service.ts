import { db } from "../db";
import { formatMoney, fromCents, toCents } from "../money";
import { draftReminderNotes, type ReminderNote } from "./draft";
import { chooseReminders, TIER_LABEL, tierCount, type ReminderTier, type SkippedFamily } from "./select";
import { UserError } from "../errors";

export type ReminderBatchPayload = {
  eventId: string;
  notes: Partial<Record<ReminderTier, ReminderNote>>;
  reminders: { invoiceId: string; familyName: string; owing: string; tier: ReminderTier; reason: string }[];
  skipped: SkippedFamily[];
};

export async function proposeReminderBatch(eventId: string, today: string) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { school: true, feeItems: true, invoices: { include: { family: true }, orderBy: { family: { familyName: "asc" } } } },
  });

  const pending = await db.approvalItem.findFirst({
    where: { eventId, kind: "REMINDER_BATCH", status: { in: ["PENDING", "EXECUTING", "FAILED"] } },
  });
  if (pending) throw new UserError("There's already a reminder batch for this event waiting in Approvals.");

  // Families who asked for help are left to the office, whether or not it has followed up yet.
  const supportFlags = await db.approvalItem.findMany({
    where: { schoolId: event.schoolId, kind: "HARDSHIP_FLAG", status: { not: "REJECTED" }, familyId: { not: null } },
    select: { familyId: true },
  });
  const needsSupport = new Set(supportFlags.map((f) => f.familyId));
  const lastReminded = await lastReminderDates(event.schoolId);

  const fee = event.feeItems[0];
  const dates = { depositDueOn: ymd(fee?.depositDueOn), dueOn: ymd(fee?.dueOn) };
  const { chosen, skipped } = chooseReminders(
    event.invoices.map((inv) => ({
      invoiceId: inv.id,
      familyName: inv.family.familyName,
      status: inv.status,
      total: toCents(inv.total),
      paid: toCents(inv.amountPaid),
      minimum: inv.minimumPayment != null ? toCents(inv.minimumPayment) : null,
      plan: planOf(inv.plan),
      needsSupport: needsSupport.has(inv.familyId),
      lastRemindedOn: inv.paypalInvoiceId ? (lastReminded.get(inv.paypalInvoiceId) ?? null) : null,
    })),
    dates,
    today,
  );
  if (!chosen.length) {
    const reasons = [...new Set(skipped.map((s) => s.reason))].slice(0, 2).join("; ");
    throw new UserError(`Nobody needs a reminder right now${reasons ? ` (${reasons})` : ""}.`);
  }

  const notes = await draftReminderNotes(
    chosen.map((c) => c.tier),
    { schoolName: event.school.name, eventTitle: event.title, startsOn: ymd(event.startsOn), ...dates, today },
  );

  const currency = event.school.currency;
  const owing = chosen.reduce((n, c) => n + c.owing, 0);
  const counts = (Object.keys(TIER_LABEL) as ReminderTier[])
    .map((t) => [t, chosen.filter((c) => c.tier === t).length] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => tierCount(t, n));

  const summary = [
    `${counts.join(", ")} through PayPal, for ${formatMoney(owing, currency)} still owing.`,
    skipped.length ? `${skipped.length} ${skipped.length === 1 ? "family is" : "families are"} left out, with the reason shown.` : null,
    "Read the wording below. Nothing is sent until you approve.",
  ]
    .filter(Boolean)
    .join(" ");

  const payload: ReminderBatchPayload = {
    eventId,
    notes,
    reminders: chosen.map((c) => ({ ...c, owing: fromCents(c.owing) })),
    skipped,
  };
  return db.approvalItem.create({
    data: {
      schoolId: event.schoolId,
      kind: "REMINDER_BATCH",
      title: `Send ${chosen.length} reminders: ${event.title}`,
      summary,
      payload,
      proposedBy: "slip",
      eventId,
    },
  });
}

// When each PayPal invoice was last reminded, from the audit log of successful sends.
export async function lastReminderDates(schoolId: string) {
  const sent = await db.agentAction.findMany({
    where: { schoolId, action: "paypal.send_invoice_reminder", ok: true },
    select: { input: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, string>();
  for (const s of sent) {
    const id = (s.input as { invoice_id?: string } | null)?.invoice_id;
    if (id) map.set(id, s.createdAt.toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }));
  }
  return map;
}

function planOf(plan: unknown) {
  const instalments = (plan as { instalments?: { dueOn: string; amount: string }[] } | null)?.instalments;
  return instalments ? instalments.map((i) => ({ dueOn: i.dueOn, amount: toCents(i.amount) })) : null;
}

function ymd(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}
