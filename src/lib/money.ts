// All money maths happens in integer cents, so 0.1 + 0.2 never bites us.

export type Cents = number;

export function toCents(value: string | number | { toString(): string }): Cents {
  const s = typeof value === "number" ? value.toFixed(2) : value.toString().trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Not a money amount: ${s}`);
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

// PayPal wants amounts as decimal strings like "85.00".
export function fromCents(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

export function formatMoney(cents: Cents, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);
}

// Split a total into n instalments; any leftover cents go on the last one. The first
// instalment becomes PayPal's minimum payment, so it must never be bigger than the rest.
export function splitInstalments(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Instalments must be a whole number ≥ 1");
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] += total - base * n;
  return parts;
}

// Split an amount in proportion to weights, to the cent, so the parts add up exactly
// (largest remainder: the cents left over go to the biggest fractions).
export function allocate(total: Cents, weights: Cents[]): Cents[] {
  const sum = weights.reduce((n, w) => n + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((n, p) => n + p, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i]++;
    left--;
  }
  return parts;
}
