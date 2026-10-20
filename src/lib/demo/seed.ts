import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

// Fake "Bellbird Primary" for the demo and for judges. Generated from a fixed seed,
// so every reset produces the same school. No real people, no real school.

// The shared school: used by the local scripts, and for visitors when making them their
// own copy is rate-limited. Every other visitor gets a private copy (see visitor.ts).
export const DEMO_SCHOOL_ID = "bellbird";
// The family judges use for "View as parent" in the shared school. Billed to the sandbox
// personal account, so judges can log in and actually pay. Copies get a random token.
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

export function generateFamilies(parentEmail: string, nguyenToken = DEMO_FAMILY_TOKEN): DemoFamily[] {
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
        linkToken: nguyenToken,
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

// Removes a demo school and everything in it. Most rows cascade from the school; the
// audit log, approvals and chats are cleared first.
export async function wipeDemoSchool(tx: Prisma.TransactionClient, schoolId: string) {
  await tx.agentAction.deleteMany({ where: { schoolId } });
  await tx.approvalItem.deleteMany({ where: { schoolId } });
  await tx.chatThread.deleteMany({ where: { family: { schoolId } } });
  await tx.school.deleteMany({ where: { id: schoolId } });
}

// Wipes a demo school and builds it again: 8 classes, 60 families, 86 students, no events.
// PayPal sandbox invoices from earlier runs stay in the sandbox; Slip just forgets them.
export async function resetDemoSchool(
  db: PrismaClient,
  opts: { schoolId?: string; schoolEmail: string; parentEmail: string },
): Promise<{ schoolId: string; nguyenToken: string }> {
  const schoolId = opts.schoolId ?? DEMO_SCHOOL_ID;
  const nguyenToken = schoolId === DEMO_SCHOOL_ID ? DEMO_FAMILY_TOKEN : randomBytes(12).toString("base64url");
  const families = generateFamilies(opts.parentEmail, nguyenToken);
  const classIds = new Map(CLASSES.map((name) => [name, randomUUID()]));
  const familyIds = families.map(() => randomUUID());

  // A handful of bulk inserts, so a visitor's own copy is ready in a moment.
  await db.$transaction(
    async (tx) => {
      await wipeDemoSchool(tx, schoolId);
      await tx.school.create({ data: { id: schoolId, name: "Bellbird Primary School", email: opts.schoolEmail } });
      await tx.classroom.createMany({
        data: CLASSES.map((name) => ({ id: classIds.get(name)!, schoolId, name, year: Number(name[0]) })),
      });
      await tx.family.createMany({
        data: families.map((f, i) => ({
          id: familyIds[i],
          schoolId,
          familyName: f.familyName,
          contactName: f.contactName,
          email: f.email,
          linkToken: f.linkToken,
        })),
      });
      await tx.student.createMany({
        data: families.flatMap((f, i) =>
          f.kids.map((k) => ({ familyId: familyIds[i], firstName: k.firstName, lastName: f.familyName, classroomId: classIds.get(k.className)! })),
        ),
      });
    },
    { timeout: 60_000 },
  );
  return { schoolId, nguyenToken };
}
