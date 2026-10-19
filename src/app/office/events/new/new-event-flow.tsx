"use client";

import { useState, useTransition } from "react";
import type { ParsedEvent } from "@/lib/events/parse";
import { Button, Card } from "@/components/ui";
import { parseEventAction, saveEventAction } from "../../actions";

const EXAMPLES = [
  "Year 4 camp at Bellbird Creek, 12–14 March, $285, $85 deposit by 1 December, balance by 1 February, needs consent.",
  "Year 6 excursion to the science museum on 20 November, $35, due 13 November, needs consent.",
  "5A and 5B swimming program, 8 lessons starting 2 February, $96, due 30 January.",
];

export function NewEventFlow() {
  const [text, setText] = useState("");
  const [event, setEvent] = useState<ParsedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function read() {
    setError(null);
    startReading(async () => {
      const result = await parseEventAction(text);
      if (result.ok) setEvent(result.data);
      else setError(result.error);
    });
  }

  function save() {
    if (!event) return;
    setError(null);
    startSaving(async () => {
      const result = await saveEventAction(event, text);
      // On success the action redirects to the new event.
      if (result && !result.ok) setError(result.error);
    });
  }

  if (!event) {
    return (
      <Card className="p-5 sm:p-6">
        <label htmlFor="describe" className="text-sm font-medium">
          What&rsquo;s the event?
        </label>
        <textarea
          id="describe"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Year 4 camp at Bellbird Creek, 12–14 March, $285…"
          className="mt-2 w-full resize-y rounded-lg border border-line bg-paper px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) read();
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-line px-3 py-1 text-left text-xs text-ink-soft hover:border-ink-faint hover:text-ink"
            >
              {ex.split(",")[0]}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={read} disabled={reading || !text.trim()}>
            {reading ? "Reading…" : "Set it up"}
          </Button>
          {reading && <span className="text-sm text-ink-soft">Slip is working out the fees, dates and classes…</span>}
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Check what Slip understood</h2>
        <p className="mt-1 text-sm text-ink-soft">Change anything that&rsquo;s not right. Nothing goes to families yet.</p>

        <div className="mt-6 grid gap-5">
          <Field label="Title">
            <Input value={event.title} onChange={(v) => setEvent({ ...event, title: v })} />
          </Field>
          <Field label="Note for parents">
            <textarea
              value={event.summary}
              onChange={(e) => setEvent({ ...event, summary: e.target.value })}
              rows={3}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Where">
              <Input value={event.location ?? ""} onChange={(v) => setEvent({ ...event, location: v || null })} />
            </Field>
            <Field label="Starts">
              <Input type="date" value={event.startsOn ?? ""} onChange={(v) => setEvent({ ...event, startsOn: v || null })} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={event.endsOn ?? ""} onChange={(v) => setEvent({ ...event, endsOn: v || null })} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Year levels" hint="e.g. 4 or 5, 6">
              <Input
                value={event.yearLevels.join(", ")}
                onChange={(v) =>
                  setEvent({
                    ...event,
                    yearLevels: v.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0),
                  })
                }
              />
            </Field>
            <Field label="Only these classes" hint="Leave empty for the whole year">
              <Input
                value={event.classNames.join(", ")}
                onChange={(v) => setEvent({ ...event, classNames: v.split(/[,\s]+/).filter(Boolean) })}
              />
            </Field>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-ink-soft">Consent</span>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={event.needsConsent}
                  onChange={(e) => setEvent({ ...event, needsConsent: e.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                Parents need to give consent
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Fees (per student)</p>
            <div className="mt-2 grid gap-3">
              {event.fees.map((fee, i) => {
                const setFee = (patch: Partial<typeof fee>) =>
                  setEvent({ ...event, fees: event.fees.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
                return (
                  <div key={i} className="grid gap-3 rounded-lg border border-line bg-paper p-3 sm:grid-cols-3">
                    <Field label="For">
                      <Input value={fee.label} onChange={(v) => setFee({ label: v })} />
                    </Field>
                    <Field label="Amount ($)">
                      <Input type="number" value={String(fee.amount)} onChange={(v) => setFee({ amount: Number(v) })} />
                    </Field>
                    <Field label="Due">
                      <Input type="date" value={fee.dueOn ?? ""} onChange={(v) => setFee({ dueOn: v || null })} />
                    </Field>
                    <Field label="Deposit ($)">
                      <Input
                        type="number"
                        value={fee.deposit == null ? "" : String(fee.deposit)}
                        onChange={(v) => setFee({ deposit: v === "" ? null : Number(v) })}
                      />
                    </Field>
                    <Field label="Deposit due">
                      <Input type="date" value={fee.depositDueOn ?? ""} onChange={(v) => setFee({ depositDueOn: v || null })} />
                    </Field>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="mt-5 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save event"}
          </Button>
          <Button variant="ghost" onClick={() => setEvent(null)} disabled={saving}>
            Start again
          </Button>
        </div>
      </Card>

      <aside className="grid content-start gap-4">
        {event.assumptions.length > 0 && (
          <Card className="border-waiting/30 bg-waiting-tint/50 p-4">
            <p className="text-sm font-semibold text-waiting">Slip assumed</p>
            <ul className="mt-2 grid gap-2 text-sm text-ink-soft">
              {event.assumptions.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden className="text-waiting">•</span>
                  {a}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {event.questions.length > 0 && (
          <Card className="border-info/30 bg-info-tint/50 p-4">
            <p className="text-sm font-semibold text-info">Slip needs to know</p>
            <ul className="mt-2 grid gap-2 text-sm text-ink-soft">
              {event.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-4">
          <p className="text-sm font-semibold">You wrote</p>
          <p className="mt-2 text-sm text-ink-soft">&ldquo;{text}&rdquo;</p>
        </Card>
      </aside>
    </div>
  );
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

function Input({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} h-10`} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-ink-soft">
        {label}
        {hint && <span className="font-normal text-ink-faint"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}
