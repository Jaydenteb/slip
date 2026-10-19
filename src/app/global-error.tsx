"use client";

// The last resort, when even the main layout fails. It replaces the whole document, so
// it carries its own minimal styles.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-AU">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f5", color: "#1f2328" }}>
        <title>Something went wrong · Slip</title>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#57606a", lineHeight: 1.5 }}>
            Slip couldn&rsquo;t load just now. Nothing has been sent or paid because of it. Try again in a moment.
          </p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#0e7c66", color: "white", fontSize: 14 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
