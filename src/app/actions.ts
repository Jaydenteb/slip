"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { allow } from "@/lib/agent/rate-limit";
import { db } from "@/lib/db";
import { resetDemoSchool } from "@/lib/demo/seed";

export async function resetDemoAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) return { ok: false, error: "The demo isn't set up on this server." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`reset:${ip}`, 3, 10 * 60_000) || !allow("reset", 30, 60 * 60_000)) {
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
