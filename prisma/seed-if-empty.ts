// Runs on every deploy: seeds the demo school only if it isn't there yet, so a deploy
// never wipes what judges or the office have done. "Reset demo" in the app reseeds.
import { PrismaClient } from "@prisma/client";
import { DEMO_SCHOOL_ID, resetDemoSchool } from "../src/lib/demo/seed";

const db = new PrismaClient();

async function main() {
  if (await db.school.findUnique({ where: { id: DEMO_SCHOOL_ID } })) {
    console.log("Demo school already exists; leaving it alone.");
    return;
  }
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) throw new Error("Set SANDBOX_SCHOOL_EMAIL and SANDBOX_PARENT_EMAIL");
  await resetDemoSchool(db, { schoolEmail, parentEmail });
  console.log("Seeded the demo school.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
