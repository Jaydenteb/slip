import { headers } from "next/headers";
import { allow, clientIp, HOUR, MINUTE } from "./agent/rate-limit";

// Checks shared by the server actions. Server actions are public endpoints: their
// arguments come from the browser and can be anything, so each one is checked here.

export const isId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v);

export const isIdList = (v: unknown, max = 20): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= max && v.every(isId);

// True when this visitor (or everyone together) has done this too often. Anything that
// calls Claude also counts towards one shared hourly cap across the whole demo.
export async function overLimit(bucket: string, perVisitor: number, perHourForEveryone: number, opts: { ai?: boolean } = {}) {
  const ip = clientIp(await headers());
  return (
    !allow(`${bucket}:${ip}`, perVisitor, 10 * MINUTE) ||
    !allow(bucket, perHourForEveryone, HOUR) ||
    (opts.ai === true && !allow("ai", 400, HOUR))
  );
}

export const BUSY = "Slip needs a breather. Try again in a few minutes.";
