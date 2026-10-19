import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { fromCents, toCents } from "../money";
import { getInvoice } from "../paypal/rest";
import { runPayPalTool } from "../paypal/toolkit";
import { createGatedPayPal } from "./gate";

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

export async function approveAndExecute(approvalItemId: string, decidedBy: string) {
  // Claim it in one conditional update, so two clicks can't run it twice.
  const claimed = await db.approvalItem.updateMany({
    where: { id: approvalItemId, status: { in: ["PENDING", "FAILED"] } },
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
      case "HARDSHIP_FLAG":
        // Nothing to run: approving a hardship flag just marks it as handled by a person.
        break;
      default:
        throw new Error(`${item.kind} approvals aren't supported yet`);
    }
    await db.approvalItem.update({ where: { id: item.id }, data: { status: "EXECUTED" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.approvalItem.update({ where: { id: item.id }, data: { status: "FAILED", error: message } });
    throw err;
  }
}

export async function rejectApproval(approvalItemId: string, decidedBy: string) {
  const updated = await db.approvalItem.updateMany({
    where: { id: approvalItemId, status: { in: ["PENDING", "FAILED"] } },
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

  // A few at a time: fast enough for a class, gentle on the sandbox.
  await inBatches(invoices, 4, async (inv) => {
    try {
      let paypalId = inv.paypalInvoiceId;
      // Create once. If a previous attempt created it but failed to send, reuse it.
      if (!paypalId) {
        const [given, ...rest] = inv.family.contactName.split(" ");
        const created = await gated(approvalItemId, "create_invoice", {
          currency_code: event.school.currency,
          invoice_date: todayInMelbourne(),
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
            unit_amount: { currency_code: event.school.currency, value: fromCents(toCents(l.amount)) },
          })),
          ...(inv.minimumPayment
            ? { allow_partial_payment: true, minimum_partial_payment_amount: fromCents(toCents(inv.minimumPayment)) }
            : {}),
        });
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
      failures.push(`${inv.family.familyName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  if (failures.length) {
    throw new Error(`${failures.length} of ${invoices.length} invoices didn't send. Approve again to retry them.\n${failures.join("\n")}`);
  }
  await db.event.update({ where: { id: event.id }, data: { status: "OPEN" } });
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
