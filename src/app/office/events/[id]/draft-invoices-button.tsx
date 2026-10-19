"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { proposeInvoicesAction } from "../../actions";

export function DraftInvoicesButton({ eventId, families }: { eventId: string; families: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-right">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await proposeInvoicesAction(eventId);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Drafting…" : `Draft invoices for ${families} ${families === 1 ? "family" : "families"}`}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
