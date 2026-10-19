// Day-1 sandbox spike: proves the PayPal pieces Slip depends on before we build on them.
// This is a dev script, so it calls the toolkit directly. The app only ever goes
// through the approval gate (src/lib/executor).
//
//   npm run spike -- create          create + send an AUD invoice with a minimum deposit
//   npm run spike -- status <id>     read status + payments straight from PayPal (the Sync path)
//   npm run spike -- cash <id> <amt> record a cash payment against the invoice
//
// Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, SANDBOX_SCHOOL_EMAIL (sandbox business
// account) and SANDBOX_PARENT_EMAIL (sandbox personal account) in .env.

import { runPayPalTool } from "../src/lib/paypal/toolkit";
import { getInvoice } from "../src/lib/paypal/rest";

const [cmd, ...args] = process.argv.slice(2);

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} in .env for the spike`);
  return v;
}

// create_invoice may return the full invoice or just a link to it, depending on the
// Prefer header; handle both so we learn which we get.
function invoiceIdFrom(result: unknown): string {
  const r = result as { id?: string; href?: string; links?: { href: string }[] };
  const href = r.href ?? r.links?.[0]?.href;
  const id = r.id ?? href?.split("/").pop();
  if (!id) throw new Error(`Couldn't find an invoice id in ${JSON.stringify(result)}`);
  return id;
}

async function create() {
  const today = new Date().toISOString().slice(0, 10);
  const created = await runPayPalTool("create_invoice", {
    currency_code: "AUD",
    invoice_date: today,
    note: "Year 4 camp at Bellbird Creek. Pay the $85 deposit now, the balance by 1 Feb.",
    invoicer_business_name: "Bellbird Primary School",
    invoicer_email_address: need("SANDBOX_SCHOOL_EMAIL"),
    invoicer_country_code: "AU",
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: "Sam", surname: "Nguyen" },
          email_address: need("SANDBOX_PARENT_EMAIL"),
        },
      },
    ],
    items: [
      {
        name: "Year 4 camp – Ava",
        quantity: "1",
        unit_amount: { currency_code: "AUD", value: "285.00" },
      },
    ],
    allow_partial_payment: true,
    minimum_partial_payment_amount: "85.00",
  });
  console.log("create_invoice →", JSON.stringify(created, null, 2));
  const id = invoiceIdFrom(created);

  const sent = await runPayPalTool("send_invoice", { invoice_id: id, send_to_recipient: true });
  console.log("send_invoice →", JSON.stringify(sent, null, 2));

  await status(id);
  console.log("\nNext: open the recipient link above, log in as the sandbox parent, pay $85,");
  console.log(`then run: npm run spike -- status ${id}`);
}

async function status(id: string) {
  const inv = await getInvoice(id);
  console.log({
    id: inv.id,
    status: inv.status,
    amount: inv.amount,
    due: inv.due_amount,
    paid: inv.payments?.paid_amount,
    transactions: inv.payments?.transactions,
    payerLink: inv.detail?.metadata?.recipient_view_url,
  });
}

async function cash(id: string, amount: string) {
  const result = await runPayPalTool("record_payment_for_invoice", {
    invoice_id: id,
    method: "CASH",
    payment_date: new Date().toISOString().slice(0, 10),
    note: "Cash handed in at the office",
    amount: { currency_code: "AUD", value: amount },
  });
  console.log("record_payment_for_invoice →", JSON.stringify(result, null, 2));
  await status(id);
}

async function main() {
  if (cmd === "create") return create();
  if (cmd === "status" && args[0]) return status(args[0]);
  if (cmd === "cash" && args[0] && args[1]) return cash(args[0], args[1]);
  console.log("Usage: npm run spike -- create | status <invoiceId> | cash <invoiceId> <amount>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
