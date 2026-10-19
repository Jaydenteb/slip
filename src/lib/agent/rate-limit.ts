// A small in-memory sliding-window limiter. The demo runs as one instance, so this
// is enough to stop one visitor (or one family link) from burning the API budget.
// The hard cap is the spend limit on the Anthropic workspace.

const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// The visitor's address, for per-visitor limits. Render sits behind Cloudflare, which
// overwrites cf-connecting-ip with the real client. X-Forwarded-For is only a fallback:
// a client can put anything at the front of it, so per-visitor limits are a courtesy and
// the shared limits (and the spend cap) are what actually hold.
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("true-client-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
