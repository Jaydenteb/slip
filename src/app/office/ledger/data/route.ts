import { after, connection } from "next/server";
import { visitorSchoolId } from "@/lib/demo/visitor";
import { loadLedgerRows } from "@/lib/ledger/rows";
import { syncOpenInvoices } from "@/lib/payments/sync";

// The ledger polls this. While someone is watching, also catch up with PayPal now and
// then, so the grid stays right even if a webhook is late or missing. However many
// people are polling, each school's invoices are checked at most once every 15 seconds.
const lastSync = new Map<string, number>();

export async function GET() {
  await connection();
  const schoolId = await visitorSchoolId();
  if (!schoolId) return Response.json([], { status: 401 });
  if (Date.now() - (lastSync.get(schoolId) ?? 0) > 15_000) {
    lastSync.set(schoolId, Date.now());
    after(() => syncOpenInvoices({ schoolId, maxAgeMs: 45_000 }).catch(() => undefined));
  }
  return Response.json(await loadLedgerRows(schoolId), { headers: { "Cache-Control": "no-store" } });
}
