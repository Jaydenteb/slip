// Runs Sync for every open invoice: npm run sync
import { db } from "../src/lib/db";
import { syncOpenInvoices } from "../src/lib/payments/sync";

syncOpenInvoices()
  .then((r) => console.log(`checked ${r.checked}, updated ${r.changed}${r.failed.length ? `, failed ${r.failed.length}` : ""}`))
  .finally(() => db.$disconnect());
