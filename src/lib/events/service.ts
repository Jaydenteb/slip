import { db } from "../db";
import { DEMO_SCHOOL_ID } from "../demo/seed";
import { buildInvoiceDrafts } from "../invoicing/build";
import { formatMoney, fromCents, toCents } from "../money";
import type { ParsedEvent } from "./parse";
import { UserError } from "../errors";

// The event the office confirmed on the review screen (the parsed event, possibly edited).
export type ConfirmedEvent = ParsedEvent & { sourceText: string };

export async function saveEvent(input: ConfirmedEvent) {
  const classrooms = await db.classroom.findMany({ where: { schoolId: DEMO_SCHOOL_ID } });
  const invited = classrooms.filter((c) =>
    input.classNames.length
      ? input.classNames.some((n) => n.toUpperCase() === c.name.toUpperCase())
      : input.yearLevels.includes(c.year),
  );
  if (!invited.length) throw new UserError("No classes match this event. Check the year levels or class names.");
  if (!input.fees.length) throw new UserError("Add at least one fee.");

  const students = await db.student.findMany({ where: { classroomId: { in: invited.map((c) => c.id) } } });

  return db.event.create({
    data: {
      schoolId: DEMO_SCHOOL_ID,
      title: input.title,
      description: input.summary,
      location: input.location,
      startsOn: toDate(input.startsOn),
      endsOn: toDate(input.endsOn),
      sourceText: input.sourceText,
      needsConsent: input.needsConsent,
      classroomIds: invited.map((c) => c.id),
      feeItems: {
        create: input.fees.map((f) => ({
          label: f.label,
          amount: fromCents(toCents(f.amount)),
          depositAmount: f.deposit != null ? fromCents(toCents(f.deposit)) : null,
          depositDueOn: toDate(f.depositDueOn),
          dueOn: toDate(f.dueOn),
        })),
      },
      enrolments: { create: students.map((s) => ({ studentId: s.id })) },
    },
  });
}

// Drafts one invoice per family for everyone enrolled who hasn't been invoiced yet,
// and puts the batch in the approvals queue. Nothing reaches PayPal from here.
export async function proposeInvoiceBatch(eventId: string) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      school: true,
      feeItems: true,
      invoices: { select: { familyId: true } },
      enrolments: { include: { student: true } },
    },
  });

  const pending = await db.approvalItem.findFirst({
    where: { eventId, kind: "INVOICE_BATCH", status: { in: ["PENDING", "EXECUTING", "FAILED"] } },
  });
  if (pending) throw new UserError("There's already an invoice batch for this event waiting in Approvals.");

  const invoiced = new Set(event.invoices.map((i) => i.familyId));
  const drafts = buildInvoiceDrafts(
    event.enrolments
      .filter((e) => !invoiced.has(e.student.familyId))
      .map((e) => ({
        studentId: e.studentId,
        firstName: e.student.firstName,
        familyId: e.student.familyId,
        attending: e.attending,
      })),
    event.feeItems.map((f) => ({
      label: f.label,
      amount: toCents(f.amount),
      deposit: f.depositAmount != null ? toCents(f.depositAmount) : null,
    })),
  );
  if (!drafts.length) throw new UserError("Every family on this event already has an invoice.");

  const invoiceIds = await db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const d of drafts) {
      const inv = await tx.invoice.create({
        data: {
          eventId,
          familyId: d.familyId,
          total: fromCents(d.total),
          minimumPayment: d.minimumPayment != null ? fromCents(d.minimumPayment) : null,
          lines: { create: d.lines.map((l) => ({ studentId: l.studentId, label: l.label, amount: fromCents(l.amount) })) },
        },
      });
      ids.push(inv.id);
    }
    return ids;
  });

  const students = drafts.reduce((n, d) => n + d.lines.length / event.feeItems.length, 0);
  const siblings = drafts.filter((d) => d.lines.length / event.feeItems.length > 1).length;
  const total = drafts.reduce((n, d) => n + d.total, 0);
  const currency = event.school.currency;

  const summary = [
    `${drafts.length} PayPal invoices for ${students} students, ${formatMoney(total, currency)} in total.`,
    siblings ? `${siblings} ${siblings === 1 ? "family has" : "families have"} more than one child going, so siblings share one invoice.` : null,
    drafts.some((d) => d.minimumPayment != null)
      ? "Families can pay in parts: the deposit is the minimum first payment."
      : "Families pay the full amount.",
    "Each family gets a PayPal invoice by email. Nothing is sent until you approve.",
  ]
    .filter(Boolean)
    .join(" ");

  return db.approvalItem.create({
    data: {
      schoolId: event.schoolId,
      kind: "INVOICE_BATCH",
      title: `Send ${drafts.length} invoices: ${event.title}`,
      summary,
      payload: { eventId, invoiceIds },
      proposedBy: "slip",
      eventId,
    },
  });
}

function toDate(ymd: string | null) {
  return ymd ? new Date(`${ymd}T00:00:00Z`) : null;
}
