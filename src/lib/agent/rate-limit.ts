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
