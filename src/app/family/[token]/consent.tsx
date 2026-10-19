"use client";

import { useOptimistic, useTransition } from "react";
import { setConsentAction } from "./actions";

export function ConsentTick({
  token,
  eventId,
  studentId,
  name,
  given,
}: {
  token: string;
  eventId: string;
  studentId: string;
  name: string;
  given: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(given);
  const [, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={optimistic}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            setOptimistic(next);
            await setConsentAction(token, eventId, studentId, next);
          });
        }}
        className="h-4 w-4 accent-brand"
      />
      I give consent for {name} to attend
    </label>
  );
}
