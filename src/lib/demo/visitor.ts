import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "../db";
import { DEMO_SCHOOL_ID, resetDemoSchool, wipeDemoSchool } from "./seed";

// Every visitor to the demo gets their own private copy of Bellbird Primary, kept in a
// cookie. Judges can't see, change or reset each other's runs. A real deployment would
// take the school from the signed-in staff member instead.

export const SCHOOL_COOKIE = "slip_school";
const SCHOOL_ID = /^(demo-[\w-]{16}|bellbird)$/;
const DAY = 24 * 60 * 60 * 1000;
const KEEP_FOR = 30 * DAY;

// The visitor's school, or null if they haven't got one (or it has been cleared away).
export const visitorSchoolId = cache(async (): Promise<string | null> => {
  const id = (await cookies()).get(SCHOOL_COOKIE)?.value;
  if (!id || !SCHOOL_ID.test(id)) return null;
  const school = await db.school.findUnique({ where: { id }, select: { lastActiveAt: true } });
  if (!school) return null;
  if (isStale(school.lastActiveAt)) {
    after(() => db.school.update({ where: { id }, data: { lastActiveAt: new Date() } }).catch(() => undefined));
  }
  return id;
});

function isStale(lastActiveAt: Date) {
  return Date.now() - lastActiveAt.getTime() > DAY / 24;
}

// For office pages and actions: the visitor's school, or off to /demo to get one.
export async function officeSchoolId(): Promise<string> {
  const id = await visitorSchoolId();
  if (!id) redirect("/demo?to=office");
  return id;
}

export async function createVisitorSchool() {
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) throw new Error("SANDBOX_SCHOOL_EMAIL and SANDBOX_PARENT_EMAIL must be set");
  return resetDemoSchool(db, { schoolId: `demo-${randomBytes(12).toString("base64url")}`, schoolEmail, parentEmail });
}

export async function rememberSchool(schoolId: string) {
  (await cookies()).set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: KEEP_FOR / 1000,
    path: "/",
  });
}

// The Nguyens' family page in this school: the "View as parent" family.
export async function nguyenToken(schoolId: string) {
  const family = await db.family.findFirst({ where: { schoolId, familyName: "Nguyen" }, select: { linkToken: true } });
  return family?.linkToken ?? null;
}

// Copies nobody has opened for a month are cleared away, a few at a time.
export async function clearOldSchools() {
  const old = await db.school.findMany({
    where: { id: { startsWith: "demo-", not: DEMO_SCHOOL_ID }, lastActiveAt: { lt: new Date(Date.now() - KEEP_FOR) } },
    select: { id: true },
    take: 10,
  });
  for (const s of old) await db.$transaction((tx) => wipeDemoSchool(tx, s.id));
}
