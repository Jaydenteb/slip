import { Suspense } from "react";
import { connection } from "next/server";
import { officeSchoolId } from "@/lib/demo/visitor";
import { loadLedgerRows } from "@/lib/ledger/rows";
import { PageHeader, Skeleton } from "@/components/ui";
import { LedgerGrid } from "./ledger-grid";

export const metadata = { title: "Ledger" };

export default function LedgerPage() {
  return (
    <>
      <PageHeader
        title="Ledger"
        description="Every student on every event, live from PayPal. Ask a question in plain English and Slip sets up the view."
      />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Ledger />
      </Suspense>
    </>
  );
}

async function Ledger() {
  await connection();
  const schoolId = await officeSchoolId();
  return <LedgerGrid initialRows={await loadLedgerRows(schoolId)} />;
}
