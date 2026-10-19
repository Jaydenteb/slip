"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncEventAction } from "../../actions";

export function SyncButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-ink-soft">{message}</span>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncEventAction(eventId);
            setMessage(
              r.ok
                ? r.data.changed
                  ? `${r.data.changed} updated from PayPal`
                  : "Up to date with PayPal"
                : r.error,
            );
          })
        }
      >
        {pending ? "Checking PayPal…" : "Sync with PayPal"}
      </Button>
    </div>
  );
}
