"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { proposeRemindersAction } from "../../actions";

export function DraftRemindersButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-right">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await proposeRemindersAction(eventId);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Slip is drafting reminders…" : "Draft reminders"}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
