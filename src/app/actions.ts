"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { allow, clientIp, HOUR, MINUTE } from "@/lib/agent/rate-limit";
import { db } from "@/lib/db";
import { resetDemoSchool } from "@/lib/demo/seed";

export async function resetDemoAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) return { ok: false, error: "The demo isn't set up on this server." };
  const ip = clientIp(await headers());
  if (!allow(`reset:${ip}`, 3, 10 * MINUTE) || !allow("reset", 12, HOUR)) {
    return { ok: false, error: "The demo was reset a moment ago. Try again in a few minutes." };
  }
  try {
    await resetDemoSchool(db, { schoolEmail, parentEmail });
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Couldn't reset the demo just now. Try again in a moment." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
