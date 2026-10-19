import { env } from "../env";

// Direct Invoicing v2 / Notifications calls for the few things the toolkit doesn't
// cover: reading invoice status for Sync, and verifying webhook signatures.
// Read-only or verification only: nothing here moves money.

let cachedToken: { token: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${env.paypalClientId()}:${env.paypalClientSecret()}`).toString("base64");
  const res = await fetch(`${env.paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export type PayPalInvoice = {
  id: string;
  status: string; // DRAFT | SENT | SCHEDULED | PAID | MARKED_AS_PAID | CANCELLED | REFUNDED | PARTIALLY_PAID | PARTIALLY_REFUNDED | ...
  detail?: {
    invoice_number?: string;
    invoice_date?: string;
    metadata?: { recipient_view_url?: string; invoicer_view_url?: string };
  };
  amount?: { value: string; currency_code: string };
  due_amount?: { value: string; currency_code: string };
  payments?: {
    paid_amount?: { value: string; currency_code: string };
    transactions?: {
      payment_id?: string;
      method?: string;
      payment_date?: string;
      payment_date_time?: string;
      amount?: { value: string; currency_code: string };
      note?: string;
    }[];
  };
};

export function getInvoice(invoiceId: string) {
  return paypalFetch<PayPalInvoice>(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`);
}

export type WebhookHeaders = {
  transmissionId: string | null;
  transmissionTime: string | null;
  certUrl: string | null;
  authAlgo: string | null;
  transmissionSig: string | null;
};

// Asks PayPal to confirm the webhook really came from PayPal for our webhook id.
export async function verifyWebhookSignature(headers: WebhookHeaders, event: unknown): Promise<boolean> {
  if (Object.values(headers).some((v) => !v)) return false;
  const result = await paypalFetch<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        cert_url: headers.certUrl,
        auth_algo: headers.authAlgo,
        transmission_sig: headers.transmissionSig,
        webhook_id: env.paypalWebhookId(),
        webhook_event: event,
      }),
    },
  );
  return result.verification_status === "SUCCESS";
}
