// Each visitor's copy of the demo school is separate: its own families, its own family
// links, and resetting one leaves the others alone.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { resetDemoSchool, wipeDemoSchool } from "../../src/lib/demo/seed";

const A = `demo-testA${Date.now().toString(36)}`.slice(0, 21);
const B = `demo-testB${Date.now().toString(36)}`.slice(0, 21);
const opts = { schoolEmail: "office@example.com", parentEmail: "parent@example.com" };

after(async () => {
  for (const id of [A, B]) await db.$transaction((tx) => wipeDemoSchool(tx, id));
  await db.$disconnect();
});

test("two copies have their own families and their own family links", async () => {
  const a = await resetDemoSchool(db, { ...opts, schoolId: A });
  const b = await resetDemoSchool(db, { ...opts, schoolId: B });
  assert.notEqual(a.nguyenToken, b.nguyenToken);
  assert.equal(await db.family.count({ where: { schoolId: A } }), 60);
  assert.equal(await db.student.count({ where: { family: { schoolId: A } } }), 86);
  const nguyenA = await db.family.findUniqueOrThrow({ where: { linkToken: a.nguyenToken } });
  assert.equal(nguyenA.schoolId, A);
});

test("resetting one copy leaves the other alone", async () => {
  const room = await db.classroom.findFirstOrThrow({ where: { schoolId: B } });
  await db.event.create({
    data: { schoolId: B, title: "Zoo trip", description: "", sourceText: "", classroomIds: [room.id] },
  });
  await resetDemoSchool(db, { ...opts, schoolId: A });
  assert.equal(await db.event.count({ where: { schoolId: B } }), 1);
  await resetDemoSchool(db, { ...opts, schoolId: B });
  assert.equal(await db.event.count({ where: { schoolId: B } }), 0);
});
