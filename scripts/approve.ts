// Approves the oldest pending approval of a kind, as the office would: npm run approve -- PAYMENT_PLAN
import type { ApprovalKind } from "@prisma/client";
import { db } from "../src/lib/db";
import { approveAndExecute } from "../src/lib/executor/run";
import { getInvoice } from "../src/lib/paypal/rest";

async function main() {
  const kind = (process.argv[2] ?? "PAYMENT_PLAN") as ApprovalKind;
  const item = await db.approvalItem.findFirst({ where: { kind, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (!item) return console.log(`No pending ${kind}`);
  console.log("approving:", item.title);
  await approveAndExecute(item.id, "office");
  const after = await db.approvalItem.findUniqueOrThrow({ where: { id: item.id } });
  console.log("status:", after.status, after.error ?? "");
  if (kind === "PAYMENT_PLAN") {
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: (item.payload as { invoiceId: string }).invoiceId } });
    const live = (await getInvoice(inv.paypalInvoiceId!)) as unknown as {
      status: string;
      configuration?: { partial_payment?: unknown };
      detail?: { note?: string; invoice_number?: string };
    };
    console.log("Slip minimum:", inv.minimumPayment?.toString(), "plan:", JSON.stringify(inv.plan));
    console.log("PayPal:", live.status, JSON.stringify(live.configuration?.partial_payment), live.detail?.invoice_number);
    console.log("PayPal note:", live.detail?.note);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
