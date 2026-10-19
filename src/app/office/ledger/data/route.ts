import { after, connection } from "next/server";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { loadLedgerRows } from "@/lib/ledger/rows";
import { syncOpenInvoices } from "@/lib/payments/sync";

// The ledger polls this. While someone is watching, also catch up with PayPal now and
// then, so the grid stays right even if a webhook is late or missing.
export async function GET() {
  await connection();
  after(() => syncOpenInvoices({ maxAgeMs: 45_000 }).catch(() => undefined));
  return Response.json(await loadLedgerRows(DEMO_SCHOOL_ID), { headers: { "Cache-Control": "no-store" } });
}
