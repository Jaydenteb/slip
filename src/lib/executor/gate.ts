import type { ApprovalKind, ApprovalStatus } from "@prisma/client";
import type { PayPalToolName } from "../paypal/toolkit";

// Which PayPal tools each kind of approval is allowed to trigger. Anything not listed
// here can't run, whatever the payload says.
export const ALLOWED_TOOLS: Record<ApprovalKind, readonly PayPalToolName[]> = {
  INVOICE_BATCH: ["create_invoice", "send_invoice", "generate_invoice_qr_code", "get_invoice"],
  PAYMENT_PLAN: [],
  REMINDER_BATCH: ["send_invoice_reminder"],
  REFUND: ["record_refund_for_invoice", "cancel_sent_invoice"],
  CASH_PAYMENT: ["record_payment_for_invoice"],
  HARDSHIP_FLAG: [],
};

export class GateError extends Error {}

export type ApprovalSnapshot = { id: string; kind: ApprovalKind; status: ApprovalStatus; schoolId: string };

export type AuditEntry = {
  schoolId: string;
  approvalItemId: string;
  action: string;
  input: unknown;
  output: unknown;
  ok: boolean;
};

export type GateDeps = {
  getApproval: (id: string) => Promise<ApprovalSnapshot | null>;
  runTool: (tool: PayPalToolName, args: unknown) => Promise<unknown>;
  audit: (entry: AuditEntry) => Promise<void>;
};

// The only path from Slip to a PayPal write. Every call needs the id of an approval
// item that a person has approved (and that's currently executing), and the tool
// must be allowed for that kind of approval.
export function createGatedPayPal(deps: GateDeps) {
  return async function gatedRun(approvalItemId: string, tool: PayPalToolName, args: unknown) {
    if (!approvalItemId) throw new GateError("PayPal calls need an approval item");
    const item = await deps.getApproval(approvalItemId);
    if (!item) throw new GateError(`No approval item ${approvalItemId}`);
    if (item.status !== "EXECUTING") {
      throw new GateError(`Approval ${approvalItemId} is ${item.status}, not approved for execution`);
    }
    if (!ALLOWED_TOOLS[item.kind].includes(tool)) {
      throw new GateError(`${tool} isn't allowed for a ${item.kind} approval`);
    }

    try {
      const output = await deps.runTool(tool, args);
      await deps.audit({ schoolId: item.schoolId, approvalItemId, action: `paypal.${tool}`, input: args, output, ok: true });
      return output;
    } catch (err) {
      const output = { error: err instanceof Error ? err.message : String(err) };
      await deps.audit({ schoolId: item.schoolId, approvalItemId, action: `paypal.${tool}`, input: args, output, ok: false });
      throw err;
    }
  };
}
