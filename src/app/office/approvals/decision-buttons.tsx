"use client";

import { useState, useTransition } from "react";
import type { ApprovalKind } from "@prisma/client";
import { Button } from "@/components/ui";
import { approveAction, rejectAction } from "../actions";

const approveLabel: Partial<Record<ApprovalKind, string>> = {
  INVOICE_BATCH: "Approve & send",
  PAYMENT_PLAN: "Approve plan",
  REMINDER_BATCH: "Approve & send reminders",
  REFUND: "Approve withdrawal",
  HARDSHIP_FLAG: "Mark as handled",
};

export function DecisionButtons({ id, kind, running }: { id: string; kind: ApprovalKind; running: boolean }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(action: "approve" | "reject") {
    setError(null);
    setWhich(action);
    start(async () => {
      const result = await (action === "approve" ? approveAction(id) : rejectAction(id));
      if (!result.ok) setError(result.error.split("\n")[0]);
    });
  }

  const busy = pending || running;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {kind !== "HARDSHIP_FLAG" && (
          <Button variant="secondary" disabled={busy} onClick={() => decide("reject")}>
            {pending && which === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        )}
        <Button disabled={busy} onClick={() => decide("approve")}>
          {busy && which !== "reject" ? (kind === "HARDSHIP_FLAG" ? "Saving…" : "Updating PayPal…") : (approveLabel[kind] ?? "Approve")}
        </Button>
      </div>
      {error && <p className="max-w-xs text-right text-sm text-danger">{error}</p>}
    </div>
  );
}
