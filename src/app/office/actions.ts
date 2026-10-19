"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseEventDescription, type ParsedEvent } from "@/lib/events/parse";
import { proposeInvoiceBatch, saveEvent } from "@/lib/events/service";
import { validateConfirmedEvent } from "@/lib/events/validate";
import { approveAndExecute, rejectApproval } from "@/lib/executor/run";
import { syncOpenInvoices } from "@/lib/payments/sync";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { publicMessage } from "@/lib/errors";
import { BUSY, isId, isIdList, overLimit } from "@/lib/guard";
import { askLedger } from "@/lib/ledger/ask";
import type { LedgerQuery } from "@/lib/ledger/query";
import { loadLedgerRows } from "@/lib/ledger/rows";
import { proposeReminderBatch } from "@/lib/reminders/service";
import { proposeWithdrawal } from "@/lib/withdrawals/service";

// Demo build: there is no login, and the office is "the office". A real deployment
// would check the signed-in staff member here before every action, and take the school
// from their session rather than from a constant.
const OFFICE = "office";
const SCHOOL = DEMO_SCHOOL_ID;

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const MAX_DESCRIPTION = 2000;
const NOT_FOUND = { ok: false, error: "That isn't there any more. Refresh the page." } as const;

// Every id from the browser is checked against this school before anything uses it.
const eventInSchool = (id: unknown) => isId(id) && db.event.findFirst({ where: { id, schoolId: SCHOOL }, select: { id: true } });

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

export async function parseEventAction(text: string): Promise<ActionResult<ParsedEvent>> {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return { ok: false, error: "Describe the event first." };
  if (trimmed.length > MAX_DESCRIPTION) return { ok: false, error: "That's a bit long. Keep it under 2,000 characters." };
  if (await overLimit("parse", 10, 60, { ai: true })) return { ok: false, error: BUSY };
  try {
    return { ok: true, data: await parseEventDescription(trimmed, today()) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Slip couldn't read that just now. Try again in a moment." };
  }
}

export async function saveEventAction(event: ParsedEvent, sourceText: string): Promise<ActionResult> {
  const checked = validateConfirmedEvent({ ...(typeof event === "object" ? event : {}), sourceText });
  if (!checked.ok) return { ok: false, error: checked.error };
  if (await overLimit("save-event", 10, 60)) return { ok: false, error: BUSY };
  let id: string;
  try {
    id = (await saveEvent(checked.event)).id;
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Couldn't save the event.") };
  }
  revalidatePath("/office/events");
  redirect(`/office/events/${id}`);
}

export async function proposeInvoicesAction(eventId: string): Promise<ActionResult> {
  if (!(await eventInSchool(eventId))) return NOT_FOUND;
  if (await overLimit("propose-invoices", 10, 60)) return { ok: false, error: BUSY };
  try {
    await proposeInvoiceBatch(eventId);
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Couldn't draft the invoices.") };
  }
  revalidatePath(`/office/events/${eventId}`);
  redirect("/office/approvals");
}

export async function proposeRemindersAction(eventId: string): Promise<ActionResult> {
  if (!(await eventInSchool(eventId))) return NOT_FOUND;
  if (await overLimit("reminders", 10, 60, { ai: true })) return { ok: false, error: BUSY };
  try {
    await proposeReminderBatch(eventId, today());
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Couldn't draft the reminders.") };
  }
  revalidatePath(`/office/events/${eventId}`);
  redirect("/office/approvals");
}

export async function proposeWithdrawalAction(invoiceId: string, studentIds: string[], reason: string): Promise<ActionResult> {
  if (!isIdList(studentIds)) return { ok: false, error: "Choose who isn't going." };
  const inv = isId(invoiceId) && (await db.invoice.findFirst({ where: { id: invoiceId, event: { schoolId: SCHOOL } }, select: { id: true } }));
  if (!inv) return NOT_FOUND;
  if (await overLimit("withdrawal", 20, 120)) return { ok: false, error: BUSY };
  let eventId: string;
  try {
    const item = await proposeWithdrawal({
      invoiceId,
      studentIds,
      reason: typeof reason === "string" ? reason.trim().slice(0, 200) || null : null,
      proposedBy: "office",
    });
    eventId = item.eventId!;
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Couldn't draft the withdrawal.") };
  }
  revalidatePath(`/office/events/${eventId}`);
  redirect("/office/approvals");
}

export async function approveAction(approvalItemId: string): Promise<ActionResult> {
  if (!isId(approvalItemId)) return NOT_FOUND;
  if (await overLimit("decide", 60, 600)) return { ok: false, error: BUSY };
  try {
    await approveAndExecute(approvalItemId, OFFICE, { schoolId: SCHOOL });
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Something went wrong. The details are on the item.") };
  } finally {
    revalidatePath("/office", "layout");
  }
}

export async function rejectAction(approvalItemId: string): Promise<ActionResult> {
  if (!isId(approvalItemId)) return NOT_FOUND;
  if (await overLimit("decide", 60, 600)) return { ok: false, error: BUSY };
  try {
    await rejectApproval(approvalItemId, OFFICE, { schoolId: SCHOOL });
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Something went wrong.") };
  } finally {
    revalidatePath("/office", "layout");
  }
}

export async function syncEventAction(eventId: string): Promise<ActionResult<{ checked: number; changed: number }>> {
  if (!(await eventInSchool(eventId))) return NOT_FOUND;
  if (await overLimit("sync", 20, 120)) return { ok: false, error: BUSY };
  try {
    const result = await syncOpenInvoices({ eventId });
    return { ok: true, data: { checked: result.checked, changed: result.changed } };
  } catch (err) {
    return { ok: false, error: publicMessage(err, "Couldn't reach PayPal. Try again in a moment.") };
  } finally {
    revalidatePath(`/office/events/${eventId}`);
  }
}

export async function askLedgerAction(question: string): Promise<ActionResult<LedgerQuery>> {
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) return { ok: false, error: "Ask a question first." };
  if (q.length > 300) return { ok: false, error: "Keep it under 300 characters." };
  if (await overLimit("ledger", 20, 200, { ai: true })) return { ok: false, error: BUSY };
  try {
    const rows = await loadLedgerRows(SCHOOL);
    const query = await askLedger(q, rows, today());
    await db.agentAction.create({
      data: {
        schoolId: SCHOOL,
        actor: "office-agent",
        action: "ledger.asked",
        input: { question: q },
        output: { explanation: query.explanation },
      },
    });
    return { ok: true, data: query };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Slip couldn't work that out just now. Try asking another way." };
  }
}
