import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paypal/rest";
import { syncInvoice } from "@/lib/payments/sync";

// PayPal webhooks. We verify the signature, record the event (its id is the primary
// key, so retries are ignored), answer 200 straight away, and then treat the event
// as a nudge to re-read the invoice from PayPal. The ledger only ever reflects what
// PayPal says, never the webhook body, so out-of-order or missed events can't skew it.
export async function POST(request: Request) {
  const body = await request.text();
  let event: { id?: string; event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event.id || !event.event_type) return new Response("Not a PayPal event", { status: 400 });

  const verified = await verifyWebhookSignature(
    {
      transmissionId: request.headers.get("paypal-transmission-id"),
      transmissionTime: request.headers.get("paypal-transmission-time"),
      certUrl: request.headers.get("paypal-cert-url"),
      authAlgo: request.headers.get("paypal-auth-algo"),
      transmissionSig: request.headers.get("paypal-transmission-sig"),
    },
    event,
  ).catch(() => false);
  if (!verified) return new Response("Signature check failed", { status: 401 });

  const paypalInvoiceId = event.resource?.invoice?.id ?? event.resource?.id ?? null;
  const recorded = await db.webhookEvent.createMany({
    data: [{ id: event.id, eventType: event.event_type, resourceId: paypalInvoiceId, payload: event as Prisma.InputJsonValue }],
    skipDuplicates: true,
  });

  if (recorded.count > 0 && event.event_type.startsWith("INVOICING.INVOICE.") && paypalInvoiceId) {
    after(async () => {
      const invoice = await db.invoice.findUnique({ where: { paypalInvoiceId }, select: { id: true } });
      if (invoice) await syncInvoice(invoice.id, "webhook");
    });
  }
  return new Response("OK");
}
