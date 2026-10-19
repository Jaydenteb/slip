import { PrismaClient } from "@prisma/client";
import { resetDemoSchool } from "../src/lib/demo/seed";

const db = new PrismaClient();

async function main() {
  const schoolEmail = process.env.SANDBOX_SCHOOL_EMAIL;
  const parentEmail = process.env.SANDBOX_PARENT_EMAIL;
  if (!schoolEmail || !parentEmail) {
    throw new Error("Set SANDBOX_SCHOOL_EMAIL and SANDBOX_PARENT_EMAIL in .env first");
  }
  await resetDemoSchool(db, { schoolEmail, parentEmail });
  const [families, students] = await Promise.all([db.family.count(), db.student.count()]);
  console.log(`Seeded Bellbird Primary: ${families} families, ${students} students`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
