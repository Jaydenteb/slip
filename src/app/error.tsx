"use client";

import Link from "next/link";
import { Button, buttonClass, Card } from "@/components/ui";

// Anything that goes wrong while a page loads lands here instead of a blank screen.
// The reference matches the line in the server logs (see src/instrumentation.ts).
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Slip couldn&rsquo;t load this page just now. Nothing has been sent or paid because of it. Try again in a moment.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <Link href="/" className={buttonClass("ghost")}>
            Back to the start
          </Link>
        </div>
        {digest && <p className="mt-6 text-xs text-ink-faint">Reference: {digest}</p>}
      </Card>
    </main>
  );
}
