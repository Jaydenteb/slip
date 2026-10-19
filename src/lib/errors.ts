// An error whose message is written for the person using Slip and is safe to show them.
// Anything else (PayPal response bodies, database errors) is logged, not shown.
export class UserError extends Error {}

export function publicMessage(err: unknown, fallback: string): string {
  if (err instanceof UserError) return err.message;
  console.error(err);
  return fallback;
}

// A short, readable reason for a failed PayPal step: PayPal's own words without the
// JSON body and debug ids. The full response is kept in the audit log.
export function briefError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const name = message.match(/"message"\s*:\s*"([^"]{1,200})"/)?.[1];
  const head = message.split(/[{\n]/)[0].trim();
  return (name ? `${head} ${name}` : head).slice(0, 200) || "PayPal didn't accept it.";
}

// Text a parent typed (or Slip summarised from them), made safe to show to the office:
// one line, no control or invisible characters, no quote marks to break out of the
// quote it's shown in, and a sensible length.
export function cleanQuote(text: string | null | undefined, max = 300): string | null {
  if (!text) return null;
  const s = text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/["\p{Pi}\p{Pf}]/gu, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s || null;
}
