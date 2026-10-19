import { Prisma } from "@prisma/client";
import { db } from "../db";
import { fromCents, toCents } from "../money";
import { getInvoice } from "../paypal/rest";
import { reconcile } from "../payments/reconcile";
import { runPayPalTool } from "../paypal/toolkit";
import { createGatedPayPal } from "./gate";
import type { PaymentPlanPayload } from "../agent/parent";
import type { ReminderBatchPayload } from "../reminders/service";
import { joinNames, loadForWithdrawal, REFUND_ACTIONS, type WithdrawalPayload } from "../withdrawals/service";
import { syncInvoice, syncOpenInvoices } from "../payments/sync";
import { briefError, UserError } from "../errors";

// The executor: runs an approval item's actions after a person approves it. This is
// the only code that moves money or contacts parents, and it only does so through
// the gate, which re-checks the approval on every PayPal call.

const gated = createGatedPayPal({
  getApproval: (id) =>
    db.approvalItem.findUnique({ where: { id }, select: { id: true, kind: true, status: true, schoolId: true } }),
  runTool: runPayPalTool,
  audit: async (e) => {
    await db.agentAction.create({
      data: {
        schoolId: e.schoolId,
        actor: "executor",
        action: e.action,
        approvalItemId: e.approvalItemId,
        input: toJson(e.input),
        output: toJson(e.output),
        ok: e.ok,
      },
    });
  },
});

export type InvoiceBatchPayload = { eventId: string; invoiceIds: string[] };

export class ApprovalStateError extends Error {}

// A run that crashed part-way (a restart, a timeout) stays EXECUTING. After this long it
// can be retried; every step checks the audit log first, so nothing runs twice.
const STUCK_AFTER_MS = 10 * 60_000;

function decidable(approvalItemId: string, schoolId?: string): Prisma.ApprovalItemWhereInput {
  return {
    id: approvalItemId,
    ...(schoolId ? { schoolId } : {}),
    OR: [
      { status: { in: ["PENDING", "FAILED"] } },
      { status: "EXECUTING", decidedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    ],
  };
}

export async function approveAndExecute(approvalItemId: string, decidedBy: string, opts: { schoolId?: string } = {}) {
  // Claim it in one conditional update, so two clicks can't run it twice.
  const claimed = await db.approvalItem.updateMany({
    where: decidable(approvalItemId, opts.schoolId),
    data: { status: "EXECUTING", decidedBy, decidedAt: new Date(), error: null },
  });
  if (claimed.count === 0) throw new ApprovalStateError("This item has already been decided or is running");

  const item = await db.approvalItem.findUniqueOrThrow({ where: { id: approvalItemId } });
  await logDecision(item.schoolId, item.id, decidedBy, "approved");

  try {
    switch (item.kind) {
      case "INVOICE_BATCH":
        await sendInvoiceBatch(item.id, item.payload as InvoiceBatchPayload);
        break;
      case "PAYMENT_PLAN":
        await applyPaymentPlan(item.id, item.payload as unknown as PaymentPlanPayload);
        break;
      case "REFUND":
        await applyWithdrawal(item.id, item.payload as unknown as WithdrawalPayload);
        break;
      case "REMINDER_BATCH":
        await sendReminderBatch(item.id, item.payload as unknown as ReminderBatchPayload);
        break;
      case "HARDSHIP_FLAG":
        // Nothing to run: approving a hardship flag just marks it as handled by a person.
        break;
      default:
        throw new Error(`${item.kind} approvals aren't supported yet`);
    }
    await db.approvalItem.update({ where: { id: item.id }, data: { status: "EXECUTED" } });
  } catch (err) {
    const message = err instanceof UserError ? err.message : briefError(err);
    await db.approvalItem.update({ where: { id: item.id }, data: { status: "FAILED", error: message } });
    // One line per failed approval in the logs, so a failing money step is easy to spot.
    console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), event: "approval.failed", kind: item.kind, approvalItemId: item.id, message }));
    throw err;
  }
}

export async function rejectApproval(approvalItemId: string, decidedBy: string, opts: { schoolId?: string } = {}) {
  const updated = await db.approvalItem.updateMany({
    where: decidable(approvalItemId, opts.schoolId),
    data: { status: "REJECTED", decidedBy, decidedAt: new Date() },
  });
  if (updated.count === 0) throw new ApprovalStateError("This item has already been decided or is running");
  const item = await db.approvalItem.findUniqueOrThrow({ where: { id: approvalItemId } });
  // Proposed invoices in a rejected batch are dropped so the office can draft again.
  if (item.kind === "INVOICE_BATCH") {
    const { invoiceIds } = item.payload as InvoiceBatchPayload;
    await db.invoice.deleteMany({ where: { id: { in: invoiceIds }, status: "PROPOSED", paypalInvoiceId: null } });
  }
  await logDecision(item.schoolId, item.id, decidedBy, "rejected");
}

async function sendInvoiceBatch(approvalItemId: string, payload: InvoiceBatchPayload) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: payload.eventId },
    include: { school: true, feeItems: true },
  });
  const invoices = await db.invoice.findMany({
    where: { id: { in: payload.invoiceIds }, eventId: event.id },
    include: { family: true, lines: true },
  });

  const note = invoiceNote(event);
  const failures: string[] = [];
  // Invoices this approval already created in PayPal, by reference, in case a previous
  // attempt stopped before saving the PayPal id.
  const created = await db.agentAction.findMany({
    where: { approvalItemId, action: "paypal.create_invoice", ok: true },
    select: { input: true, output: true },
  });
  const createdFor = new Map(created.map((c) => [(c.input as { reference?: string }).reference, c.output]));

  // A few at a time: fast enough for a class, gentle on the sandbox.
  await inBatches(invoices, 4, async (inv) => {
    // Sent (or paid) on an earlier attempt: never send it twice.
    if (inv.status !== "PROPOSED") return;
    try {
      let paypalId = inv.paypalInvoiceId;
      const fields = invoiceFields(event, inv, note, inv.minimumPayment != null ? toCents(inv.minimumPayment) : null);
      const earlier = createdFor.get(fields.reference);
      if (!paypalId && earlier) {
        paypalId = invoiceIdFrom(earlier);
        await db.invoice.update({ where: { id: inv.id }, data: { paypalInvoiceId: paypalId } });
      }
      // Create once. If a previous attempt created it but failed to send, reuse it.
      if (!paypalId) {
        const created = await gated(approvalItemId, "create_invoice", { invoice_date: todayInMelbourne(), ...fields });
        paypalId = invoiceIdFrom(created);
        await db.invoice.update({ where: { id: inv.id }, data: { paypalInvoiceId: paypalId } });
      }

      await gated(approvalItemId, "send_invoice", { invoice_id: paypalId, send_to_recipient: true });
      const live = await getInvoice(paypalId);
      await db.invoice.update({
        where: { id: inv.id },
        data: {
          status: "SENT",
          paypalPayerUrl: live.detail?.metadata?.recipient_view_url ?? null,
          lastSyncedAt: new Date(),
        },
      });
    } catch (err) {
      failures.push(`${inv.family.familyName}: ${briefError(err)}`);
    }
  });

  if (failures.length) {
    throw new UserError(`${failures.length} of ${invoices.length} invoices didn't send. Approve again to retry them.\n${failures.join("\n")}`);
  }
  await db.event.update({ where: { id: event.id }, data: { status: "OPEN" } });
}

async function sendReminderBatch(approvalItemId: string, payload: ReminderBatchPayload) {
  // Approving again after a partial failure only retries the families that didn't get one.
  const done = await db.agentAction.findMany({
    where: { approvalItemId, action: "paypal.send_invoice_reminder", ok: true },
    select: { input: true },
  });
  const alreadySent = new Set(done.map((d) => (d.input as { invoice_id?: string } | null)?.invoice_id));
  // Catch up with PayPal first, so nobody who has just paid gets chased. If PayPal
  // couldn't be checked for a family, they're skipped rather than chased on old numbers.
  const sync = await syncOpenInvoices({ eventId: payload.eventId, maxAgeMs: 60_000 });
  const unchecked = new Set(sync.failed);
  const invoices = await db.invoice.findMany({
    where: { id: { in: payload.reminders.map((r) => r.invoiceId) }, eventId: payload.eventId },
    include: { family: true },
  });
  // A family who asked for help after the batch was drafted is left to the office.
  const flagged = await db.approvalItem.findMany({
    where: { kind: "HARDSHIP_FLAG", status: { not: "REJECTED" }, familyId: { in: invoices.map((i) => i.familyId) } },
    select: { familyId: true },
  });
  const needsSupport = new Set(flagged.map((f) => f.familyId));
  const failures: string[] = [];

  await inBatches(invoices, 4, async (inv) => {
    const reminder = payload.reminders.find((r) => r.invoiceId === inv.id);
    const note = reminder && payload.notes[reminder.tier];
    // Paid in the meantime, or cancelled: no reminder.
    if (!reminder || !note || !inv.paypalInvoiceId || alreadySent.has(inv.paypalInvoiceId)) return;
    if (needsSupport.has(inv.familyId) || unchecked.has(inv.id)) return;
    if (!["SENT", "PARTIALLY_PAID"].includes(inv.status) || toCents(inv.amountPaid) >= toCents(inv.total)) return;
    try {
      await gated(approvalItemId, "send_invoice_reminder", { invoice_id: inv.paypalInvoiceId, subject: note.subject, note: note.note });
    } catch (err) {
      failures.push(`${inv.family.familyName}: ${briefError(err)}`);
    }
  });

  if (failures.length) {
    throw new UserError(`${failures.length} of ${invoices.length} reminders didn't send. Approve again to retry them.\n${failures.join("\n")}`);
  }
}

// Withdrawing children: the PayPal invoice is cut down (or cancelled if nothing was paid),
// any refund goes back the way it came, then Slip's own records follow.
async function applyWithdrawal(approvalItemId: string, payload: WithdrawalPayload) {
  const { inv, auditedRefunds } = await loadForWithdrawal(payload.invoiceId);
  const event = await db.event.findUniqueOrThrow({ where: { id: inv.eventId }, include: { school: true, feeItems: true } });
  const { plan } = payload;
  const done = await db.agentAction.findMany({ where: { approvalItemId, ok: true }, select: { action: true, input: true } });
  const did = (action: string, match: (input: Record<string, unknown>) => boolean = () => true) =>
    done.some((d) => d.action === action && match((d.input ?? {}) as Record<string, unknown>));
  const refundedHere = done
    .filter((d) => (REFUND_ACTIONS as readonly string[]).includes(d.action))
    .reduce((n, d) => n + toCents(((d.input as { amount?: { value: string } }).amount?.value) ?? "0"), 0);

  // Stop if money moved since the office looked at this (refunds from a retry don't count).
  // Slip's own refunds are checked in the audit log too, because PayPal shows them late.
  const gross = toCents(inv.amountPaid) + toCents(inv.amountRefunded);
  if (
    gross !== payload.grossPaid ||
    toCents(inv.amountRefunded) !== payload.refundedSoFar + refundedHere ||
    auditedRefunds - refundedHere > payload.refundedSoFar
  ) {
    throw new UserError("Payments on this invoice changed since the withdrawal was drafted. Reject it and draft it again.");
  }
  const paypalId = inv.paypalInvoiceId!;
  const currency = event.school.currency;

  if (plan.cancel) {
    if (inv.status !== "CANCELLED" && !did("paypal.cancel_sent_invoice")) {
      await gated(approvalItemId, "cancel_sent_invoice", { invoice_id: paypalId, send_to_recipient: true });
    }
  } else if (plan.paypalItems.length && !did("paypal.update_invoicing")) {
    const note = `${invoiceNote(event)} ${joinNames(plan.withdrawn)} withdrawn${plan.refund ? `; ${fromCents(plan.refund)} ${currency} refunded` : ""}.`;
    const live = await getInvoice(paypalId);
    const fields = invoiceFields(event, inv, note, plan.minimum);
    await gated(approvalItemId, "update_invoicing", {
      resource_type: "invoice",
      invoice_update: {
        invoice_id: paypalId,
        invoice_number: live.detail?.invoice_number,
        invoice_date: live.detail?.invoice_date,
        send_to_recipient: true,
        ...fields,
        items: plan.paypalItems.map((i) => ({ name: i.name, quantity: "1", unit_amount: { currency_code: currency, value: fromCents(i.amount) } })),
      },
    });
  }

  for (const step of plan.refundSteps) {
    const amount = { currency_code: currency, value: fromCents(step.amount) };
    if (step.kind === "paypal") {
      if (did("paypal.create_refund", (i) => i.capture_id === step.captureId)) continue;
      await gated(approvalItemId, "create_refund", {
        capture_id: step.captureId,
        amount,
        invoice_id: paypalId,
        note_to_payer: `${event.title}: refund for ${joinNames(plan.withdrawn)}.`,
      });
    } else {
      if (did("paypal.record_refund_for_invoice")) continue;
      await gated(approvalItemId, "record_refund_for_invoice", {
        invoice_id: paypalId,
        method: step.method,
        refund_date: todayInMelbourne(),
        amount,
      });
    }
  }

  // Only children on this family's invoice, whatever the payload says.
  const leaving = inv.lines.filter((l) => payload.studentIds.includes(l.studentId)).map((l) => l.studentId);
  await db.$transaction([
    db.invoiceLine.deleteMany({ where: { invoiceId: inv.id, studentId: { in: leaving } } }),
    db.invoice.update({
      where: { id: inv.id },
      data: {
        total: fromCents(plan.remainingTotal),
        minimumPayment: plan.minimum != null ? fromCents(plan.minimum) : null,
        plan: Prisma.DbNull,
        ...(plan.cancel ? { status: "CANCELLED" } : {}),
      },
    }),
    db.enrolment.updateMany({
      where: { eventId: inv.eventId, studentId: { in: leaving }, student: { familyId: inv.familyId } },
      data: { attending: false },
    }),
  ]);
  // PayPal takes a few seconds to attach a refund to the invoice; wait for it so the
  // ledger and the family page don't briefly show the money as still paid.
  if (plan.refund > 0) {
    const expected = payload.refundedSoFar + plan.refund;
    for (let i = 0; i < 8; i++) {
      if (reconcile(await getInvoice(paypalId)).amountRefunded >= expected) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await syncInvoice(inv.id);
}

type InvoiceForPayPal = Prisma.InvoiceGetPayload<{ include: { family: true; lines: true } }>;
type EventForPayPal = Prisma.EventGetPayload<{ include: { school: true } }>;

// The PayPal invoice fields Slip controls, shared by create and update so they can't drift.
function invoiceFields(event: EventForPayPal, inv: InvoiceForPayPal, note: string, minimum: number | null) {
  const [given, ...rest] = inv.family.contactName.split(" ");
  const currency = event.school.currency;
  return {
    currency_code: currency,
    reference: `${event.title} · ${inv.family.familyName} family`,
    note,
    invoicer_business_name: event.school.name,
    invoicer_email_address: event.school.email,
    invoicer_country_code: event.school.countryCode,
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: given, surname: rest.join(" ") || inv.family.familyName },
          ...(inv.family.email ? { email_address: inv.family.email } : {}),
        },
      },
    ],
    items: inv.lines.map((l) => ({
      name: l.label,
      quantity: "1",
      unit_amount: { currency_code: currency, value: fromCents(toCents(l.amount)) },
    })),
    ...(minimum != null ? { allow_partial_payment: true, minimum_partial_payment_amount: fromCents(minimum) } : {}),
  };
}

// An approved payment plan lowers the PayPal invoice's minimum payment to the first
// instalment, so the family can pay as they go, and records the schedule.
async function applyPaymentPlan(approvalItemId: string, payload: PaymentPlanPayload) {
  // The plan splits what was owing when it was drafted; if that's changed (a payment,
  // a withdrawal), it no longer adds up and the family needs a new one.
  await syncInvoice(payload.invoiceId);
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id: payload.invoiceId },
    include: { family: true, lines: true, event: { include: { school: true } } },
  });
  if (!inv.paypalInvoiceId) throw new UserError("This invoice hasn't been sent through PayPal yet");
  if (!["SENT", "PARTIALLY_PAID"].includes(inv.status)) throw new UserError("This invoice is no longer open, so the plan isn't needed.");
  const planned = payload.instalments.reduce((n, i) => n + toCents(i.amount), 0);
  if (planned !== toCents(inv.total) - toCents(inv.amountPaid)) {
    throw new UserError("What's owing has changed since this plan was drafted. Reject it and ask the family to request a new one.");
  }
  const first = toCents(payload.instalments[0].amount);
  const schedule = payload.instalments
    .map((i) => `${formatDate(new Date(`${i.dueOn}T00:00:00Z`))}: $${i.amount}`)
    .join("; ");
  const note = `${inv.event.title}. Payment plan agreed with the school: ${schedule}.`;

  // update_invoicing replaces the invoice, so carry over PayPal's own number and date.
  const live = await getInvoice(inv.paypalInvoiceId);
  await gated(approvalItemId, "update_invoicing", {
    resource_type: "invoice",
    invoice_update: {
      invoice_id: inv.paypalInvoiceId,
      invoice_number: live.detail?.invoice_number,
      invoice_date: live.detail?.invoice_date,
      send_to_recipient: false,
      ...invoiceFields(inv.event, inv, note, first),
      // Keep PayPal's own items (they may include a "withdrawn – refunded" line).
      ...(live.items?.length ? { items: live.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_amount: i.unit_amount })) } : {}),
    },
  });
  await db.invoice.update({
    where: { id: inv.id },
    data: {
      minimumPayment: fromCents(first),
      plan: { frequency: payload.frequency, instalments: payload.instalments, agreedAt: new Date().toISOString() },
    },
  });
}

function invoiceNote(event: { title: string; feeItems: { depositAmount: Prisma.Decimal | null; depositDueOn: Date | null; dueOn: Date | null }[] }) {
  const fee = event.feeItems[0];
  const parts = [event.title + "."];
  if (fee?.depositAmount && fee.depositDueOn) {
    parts.push(`Pay at least the deposit by ${formatDate(fee.depositDueOn)}.`);
  }
  if (fee?.dueOn) parts.push(`The full amount is due by ${formatDate(fee.dueOn)}.`);
  parts.push("Questions, or need a payment plan? Use the link from the school to ask Slip.");
  return parts.join(" ");
}

// create_invoice returns a link to the new invoice rather than the invoice itself.
export function invoiceIdFrom(result: unknown): string {
  const r = result as { id?: string; href?: string };
  const id = r.id ?? r.href?.split("/").pop();
  if (!id) throw new Error(`No invoice id in PayPal's response: ${JSON.stringify(result)}`);
  return id;
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function logDecision(schoolId: string, approvalItemId: string, decidedBy: string, decision: string) {
  await db.agentAction.create({
    data: { schoolId, actor: decidedBy, action: `approval.${decision}`, approvalItemId },
  });
}

function todayInMelbourne() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
