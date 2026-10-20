"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { proposeWithdrawalAction } from "../../actions";

// For when a parent rings the office instead of asking Slip. Slip still works out the
// money and the office approves it like anything else.
export function WithdrawButton({ invoiceId, students }: { invoiceId: string; students: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(students.length === 1 ? [students[0].id] : []);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm whitespace-nowrap text-ink-soft hover:text-ink">
        Withdraw…
      </button>
    );
  }
  return (
    <div className="grid justify-items-end gap-2 text-left">
      <div className="flex flex-wrap justify-end gap-3">
        {students.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(s.id)}
              onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
              className="accent-brand"
            />
            {s.name}
          </label>
        ))}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional, no medical details)"
        aria-label="Reason (optional, no medical details)"
        maxLength={200}
        className="w-64 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={pending || chosen.length === 0}
          onClick={() =>
            start(async () => {
              const r = await proposeWithdrawalAction(invoiceId, chosen, reason);
              if (r && !r.ok) setError(r.error);
            })
          }
        >
          {pending ? "Working it out…" : "Draft withdrawal"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
