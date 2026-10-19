"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseEventDescription, type ParsedEvent } from "@/lib/events/parse";
import { proposeInvoiceBatch, saveEvent } from "@/lib/events/service";
import { approveAndExecute, rejectApproval } from "@/lib/executor/run";
import { syncOpenInvoices } from "@/lib/payments/sync";
import { headers } from "next/headers";
import { allow } from "@/lib/agent/rate-limit";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { askLedger } from "@/lib/ledger/ask";
import type { LedgerQuery } from "@/lib/ledger/query";
import { loadLedgerRows } from "@/lib/ledger/rows";

// Demo build: there is no login, and the office is "the office". A real deployment
// would check the signed-in staff member here before every action.
const OFFICE = "office";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const MAX_DESCRIPTION = 2000;

export async function parseEventAction(text: string): Promise<ActionResult<ParsedEvent>> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Describe the event first." };
  if (trimmed.length > MAX_DESCRIPTION) return { ok: false, error: "That's a bit long. Keep it under 2,000 characters." };
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    return { ok: true, data: await parseEventDescription(trimmed, today) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Slip couldn't read that just now. Try again in a moment." };
  }
}

export async function saveEventAction(event: ParsedEvent, sourceText: string): Promise<ActionResult> {
  let id: string;
  try {
    id = (await saveEvent({ ...event, sourceText })).id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the event." };
  }
  revalidatePath("/office/events");
  redirect(`/office/events/${id}`);
}

export async function proposeInvoicesAction(eventId: string): Promise<ActionResult> {
  try {
    await proposeInvoiceBatch(eventId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't draft the invoices." };
  }
  revalidatePath(`/office/events/${eventId}`);
  redirect("/office/approvals");
}

export async function approveAction(approvalItemId: string): Promise<ActionResult> {
  try {
    await approveAndExecute(approvalItemId, OFFICE);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  } finally {
    revalidatePath("/office", "layout");
  }
}

export async function rejectAction(approvalItemId: string): Promise<ActionResult> {
  try {
    await rejectApproval(approvalItemId, OFFICE);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  } finally {
    revalidatePath("/office", "layout");
  }
}

export async function syncEventAction(eventId: string): Promise<ActionResult<{ checked: number; changed: number }>> {
  try {
    const result = await syncOpenInvoices({ eventId });
    return { ok: true, data: { checked: result.checked, changed: result.changed } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach PayPal." };
  } finally {
    revalidatePath(`/office/events/${eventId}`);
  }
}

export async function askLedgerAction(question: string): Promise<ActionResult<LedgerQuery>> {
  const q = question.trim();
  if (!q) return { ok: false, error: "Ask a question first." };
  if (q.length > 300) return { ok: false, error: "Keep it under 300 characters." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`ledger:${ip}`, 20, 10 * 60_000) || !allow("global", 400, 60 * 60_000)) {
    return { ok: false, error: "Slip needs a breather. Try again in a few minutes." };
  }
  try {
    const rows = await loadLedgerRows(DEMO_SCHOOL_ID);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    const query = await askLedger(q, rows, today);
    await db.agentAction.create({
      data: {
        schoolId: DEMO_SCHOOL_ID,
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
