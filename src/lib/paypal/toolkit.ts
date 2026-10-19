import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { env } from "../env";

// The PayPal tools Slip uses. Nothing here is ever handed to a model: the model only
// gets read + propose tools (src/lib/agent). These run from the executor after a
// person approves.
export const PAYPAL_TOOLS = [
  "create_invoice",
  "get_invoice",
  "send_invoice",
  "send_invoice_reminder",
  "cancel_sent_invoice",
  "generate_invoice_qr_code",
  "record_payment_for_invoice",
  "record_refund_for_invoice",
] as const;

export type PayPalToolName = (typeof PAYPAL_TOOLS)[number];

export class PayPalToolError extends Error {
  constructor(
    public tool: PayPalToolName,
    public detail: unknown,
  ) {
    super(`PayPal ${tool} failed: ${JSON.stringify(detail)}`);
  }
}

let toolkit: PayPalAgentToolkit | undefined;

function getToolkit() {
  toolkit ??= new PayPalAgentToolkit({
    clientId: env.paypalClientId(),
    clientSecret: env.paypalClientSecret(),
    configuration: {
      actions: {
        invoices: {
          create: true,
          get: true,
          send: true,
          sendReminder: true,
          cancel: true,
          generateQRC: true,
          recordPayment: true,
          recordRefund: true,
        },
      },
      context: { sandbox: env.paypalSandbox() },
    },
  });
  return toolkit;
}

// Runs one toolkit tool directly. The toolkit returns errors as JSON strings rather
// than throwing, so we parse the result and turn `{ error }` back into an exception.
export async function runPayPalTool(name: PayPalToolName, args: unknown): Promise<unknown> {
  const tool = getToolkit().getTools()[name];
  if (!tool?.execute) throw new Error(`PayPal tool ${name} is not enabled`);
  const parsed = tool.parameters.safeParse(args);
  if (!parsed.success) throw new PayPalToolError(name, parsed.error.issues);
  const raw = await tool.execute(parsed.data, { toolCallId: name, messages: [] });
  const result = typeof raw === "string" ? safeJson(raw) : raw;
  if (result && typeof result === "object" && "error" in result) {
    throw new PayPalToolError(name, (result as { error: unknown }).error);
  }
  return result;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
