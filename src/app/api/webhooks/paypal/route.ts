import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paypal/rest";
import { syncInvoice } from "@/lib/payments/sync";

// PayPal webhooks. We verify the signature, record the event (its id is the primary
// key, so retries are ignored), answer 200 straight away, and then treat the event
// as a nudge to re-read the invoice from PayPal. The ledger only ever reflects what
// PayPal says, never the webhook body, so out-of-order or missed events can't skew it.
// PayPal's invoice events are a few kilobytes; anything far bigger isn't from PayPal.
const MAX_BODY = 256 * 1024;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("Too large", { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response("Too large", { status: 413 });
  let event: { id?: string; event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event.id || !event.event_type) return new Response("Not a PayPal event", { status: 400 });
  // Only ask PayPal to check signatures on requests that carry all of PayPal's headers.
  const signed = ["paypal-transmission-id", "paypal-transmission-time", "paypal-cert-url", "paypal-auth-algo", "paypal-transmission-sig"];
  if (!signed.every((h) => request.headers.get(h))) return new Response("Signature check failed", { status: 401 });

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
