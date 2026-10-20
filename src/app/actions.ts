"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { allow, clientIp, HOUR, MINUTE } from "@/lib/agent/rate-limit";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID, resetDemoSchool } from "@/lib/demo/seed";
import { createVisitorSchool, rememberSchool, visitorSchoolId } from "@/lib/demo/visitor";

// Resets this visitor's own copy of the school. Nobody else's demo is touched. A visitor
// on the shared school (or with no school yet) gets a fresh copy of their own instead.
export async function resetDemoAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) return { ok: false, error: "The demo isn't set up on this server." };
  const ip = clientIp(await headers());
  if (!allow(`reset:${ip}`, 5, 10 * MINUTE) || !allow("reset", 300, HOUR)) {
    return { ok: false, error: "The demo was reset a moment ago. Try again in a few minutes." };
  }
  try {
    const schoolId = await visitorSchoolId();
    if (schoolId && schoolId !== DEMO_SCHOOL_ID) {
      await resetDemoSchool(db, { schoolId, schoolEmail, parentEmail });
    } else {
      if (!allow(`new-school:${ip}`, 5, HOUR) || !allow("new-school", 300, HOUR)) {
        return { ok: false, error: "Lots of people are trying Slip right now. Try again in a few minutes." };
      }
      await rememberSchool((await createVisitorSchool()).schoolId);
    }
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Couldn't reset the demo just now. Try again in a moment." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
