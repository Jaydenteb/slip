import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReminderNote } from "./draft";

const good = {
  subject: "Year 4 camp: deposit due 1 December 2026",
  note: "A friendly reminder that the camp deposit is due on 1 December 2026. If paying is hard right now, please contact the office in confidence; help such as the Camps, Sports and Excursions Fund (CSEF) may be available. Bellbird Primary office",
};

test("a normal reminder passes", () => {
  assert.equal(checkReminderNote(good), null);
});

test("links, email addresses and phone numbers are refused", () => {
  assert.equal(checkReminderNote({ ...good, note: `${good.note} Pay at https://evil.example` }), "it contains a link");
  assert.equal(checkReminderNote({ ...good, note: `${good.note} Or pay-now.com` }), "it contains a link");
  assert.equal(checkReminderNote({ ...good, note: `${good.note} Email fees@school.example` }), "it contains an email address");
  assert.equal(checkReminderNote({ ...good, note: `${good.note} Call 0400 123 456` }), "it contains a phone number");
});

test("dates aren't mistaken for phone numbers", () => {
  assert.equal(checkReminderNote({ ...good, subject: "Deposit due 2026-12-01" }), null);
});

test("the offer of help has to be there, and the note has to be short", () => {
  assert.equal(checkReminderNote({ ...good, note: "Please pay now. Bellbird Primary office" }), "it doesn't offer help with CSEF");
  assert.equal(checkReminderNote({ ...good, note: `${good.note} ${"x".repeat(900)}` }), "the note is missing or too long");
});
