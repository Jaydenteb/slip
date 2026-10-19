import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Fake "Bellbird Primary" for the demo and for judges. Generated from a fixed seed,
// so every reset produces the same school. No real people, no real school.

export const DEMO_SCHOOL_ID = "bellbird";
// The family judges use for "View as parent". Billed to the sandbox personal account,
// so judges can log in and actually pay.
export const DEMO_FAMILY_TOKEN = "nguyen-family";

const CLASSES = ["3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];

const SURNAMES = [
  "Nguyen", "Smith", "Patel", "Williams", "Chen", "Brown", "Singh", "Jones", "Kelly",
  "Murphy", "Ahmed", "Taylor", "Wilson", "Tran", "Martin", "Anderson", "Ryan", "Walsh",
  "Thompson", "White", "Kaur", "Harris", "Lee", "Robinson", "Clarke", "Wright", "Hall",
  "Young", "King", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell",
  "Mitchell", "Roberts", "Carter", "Phillips", "Evans", "Turner", "Torres", "Parker",
  "Collins", "Edwards", "Stewart", "Morris", "Rossi", "Russo", "Cook", "Rogers",
  "Morgan", "Cooper", "Peterson", "Bailey", "Reed", "Kim", "Howard", "Ward",
];

const KID_NAMES = [
  "Ava", "Leo", "Mia", "Oliver", "Isla", "Noah", "Charlotte", "Jack", "Amelia", "William",
  "Ruby", "Henry", "Grace", "Lucas", "Chloe", "Hudson", "Zoe", "Thomas", "Sophie", "James",
  "Ella", "Archie", "Matilda", "Harrison", "Willow", "Oscar", "Lily", "Hugo", "Ivy", "Max",
  "Aria", "Ethan", "Harper", "Liam", "Evie", "Arlo", "Olivia", "Felix", "Layla", "Theo",
  "Priya", "Arjun", "Mei", "Kai", "Sana", "Omar", "Anika", "Ravi", "Hana", "Tariq",
];

const PARENT_NAMES = [
  "Sam", "Alex", "Jordan", "Taylor", "Chris", "Jess", "Michelle", "David", "Sarah", "Ben",
  "Emma", "Dan", "Kate", "Matt", "Lauren", "Nick", "Rachel", "Tom", "Anna", "Josh",
  "Mel", "Steve", "Bec", "Pete", "Nat", "Andy", "Kim", "Lisa", "Mark", "Jen",
];

// Small deterministic PRNG (mulberry32), so the school is the same every time.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DemoFamily = {
  familyName: string;
  contactName: string;
  email: string;
  linkToken: string;
  kids: { firstName: string; className: string }[];
};

export function generateFamilies(parentEmail: string): DemoFamily[] {
  const random = rng(20261113);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

  return SURNAMES.map((surname, i) => {
    const contact = pick(PARENT_NAMES);
    // The Nguyens are the demo family: two kids in Year 4 so sibling combining shows up.
    if (i === 0) {
      return {
        familyName: surname,
        contactName: `${contact} ${surname}`,
        email: parentEmail,
        linkToken: DEMO_FAMILY_TOKEN,
        kids: [
          { firstName: "Ava", className: "4B" },
          { firstName: "Leo", className: "4A" },
        ],
      };
    }
    const kidCount = random() < 0.65 ? 1 : random() < 0.8 ? 2 : 3;
    const used = new Set<string>();
    const kids = Array.from({ length: kidCount }, () => {
      let firstName = pick(KID_NAMES);
      while (used.has(firstName)) firstName = pick(KID_NAMES);
      used.add(firstName);
      return { firstName, className: pick(CLASSES) };
    });
    return {
      familyName: surname,
      contactName: `${contact} ${surname}`,
      email: `${contact}.${surname}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com",
      linkToken: randomBytes(12).toString("base64url"),
      kids,
    };
  });
}

// Wipes the demo school (everything cascades from it) and builds it again.
// PayPal sandbox invoices from earlier runs stay in the sandbox; Slip just forgets them.
export async function resetDemoSchool(db: PrismaClient, opts: { schoolEmail: string; parentEmail: string }) {
  await db.$transaction(async (tx) => {
    await tx.agentAction.deleteMany({ where: { schoolId: DEMO_SCHOOL_ID } });
    await tx.approvalItem.deleteMany({ where: { schoolId: DEMO_SCHOOL_ID } });
    await tx.chatThread.deleteMany({ where: { family: { schoolId: DEMO_SCHOOL_ID } } });
    await tx.chatThread.deleteMany({ where: { familyId: null } });
    await tx.school.deleteMany({ where: { id: DEMO_SCHOOL_ID } });

    await tx.school.create({
      data: { id: DEMO_SCHOOL_ID, name: "Bellbird Primary School", email: opts.schoolEmail },
    });

    const classIds = new Map<string, string>();
    for (const name of CLASSES) {
      const c = await tx.classroom.create({
        data: { schoolId: DEMO_SCHOOL_ID, name, year: Number(name[0]) },
      });
      classIds.set(name, c.id);
    }

    for (const fam of generateFamilies(opts.parentEmail)) {
      await tx.family.create({
        data: {
          schoolId: DEMO_SCHOOL_ID,
          familyName: fam.familyName,
          contactName: fam.contactName,
          email: fam.email,
          linkToken: fam.linkToken,
          students: {
            create: fam.kids.map((k) => ({
              firstName: k.firstName,
              lastName: fam.familyName,
              classroomId: classIds.get(k.className)!,
            })),
          },
        },
      });
    }
  }, { timeout: 60_000 });
}
