"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { resetDemoAction } from "./actions";

// Two steps, so nobody clears the shared demo by accident.
export function ResetDemo() {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => {
            setConfirming(true);
            setMessage(null);
          }}>
          Reset the demo
        </Button>
        {message && <span className="text-sm text-ink-soft">{message}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink-soft">
        This clears every event, invoice, payment and chat, and starts Bellbird Primary again.
      </span>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resetDemoAction();
            setConfirming(false);
            setMessage(r.ok ? "Done. Bellbird Primary is back to a fresh start." : r.error);
          })
        }
      >
        {pending ? "Resetting…" : "Yes, reset"}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
