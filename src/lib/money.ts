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

// Split a total into n instalments; any leftover cents go on the first one.
export function splitInstalments(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Instalments must be a whole number ≥ 1");
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[0] += total - base * n;
  return parts;
}
