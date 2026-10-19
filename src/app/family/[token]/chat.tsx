"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ChatTurn } from "@/lib/agent/parent";
import { Card } from "@/components/ui";
import { newChatAction, sendMessageAction } from "./actions";

const SUGGESTIONS = ["How much do I owe, and when?", "Can I pay it off weekly?", "Things are a bit tight at the moment"];

export function Chat({ token, initialTurns, firstName }: { token: string; initialTurns: ChatTurn[]; firstName: string }) {
  const [turns, setTurns] = useState(initialTurns);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, pending]);

  function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setDraft("");
    const before = turns;
    setTurns([...turns, { from: "parent", text: message, actions: [] }]);
    start(async () => {
      const result = await sendMessageAction(token, message);
      if (result.ok) setTurns(result.turns);
      else {
        setTurns(before);
        setDraft(message);
        setError(result.error);
      }
    });
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <p className="font-semibold">Questions? Ask Slip</p>
          <p className="text-xs text-ink-faint">Slip can explain what&rsquo;s owed and ask the office about payment plans.</p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => start(async () => { await newChatAction(token); setTurns([]); })}
            className="text-xs text-ink-soft hover:text-ink"
          >
            New chat
          </button>
        )}
      </div>

      <div className="grid max-h-[28rem] min-h-40 content-start gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {turns.length === 0 && (
          <p className="text-sm text-ink-soft">Hi {firstName}! Ask anything about what&rsquo;s owed, due dates or paying in instalments.</p>
        )}
        {turns.map((t, i) =>
          t.from === "parent" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">
              {t.text}
            </div>
          ) : (
            <div key={i} className="max-w-[90%]">
              <div className="grid gap-2 rounded-2xl rounded-bl-md bg-paper px-4 py-2.5 text-sm">
                {t.text.split(/\n{2,}/).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              {t.actions.map((a) => (
                <p key={a} className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-waiting-tint px-2.5 py-0.5 text-xs font-medium text-waiting">
                  <span aria-hidden>●</span> {a}
                </p>
              ))}
            </div>
          ),
        )}
        {pending && (
          <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-paper px-4 py-3" aria-label="Slip is typing">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink-faint hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          placeholder="Type a question…"
          aria-label="Message Slip"
          className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:bg-brand/40"
        >
          Send
        </button>
      </form>
      {error && <p className="px-5 pb-3 text-sm text-danger">{error}</p>}
    </Card>
  );
}
