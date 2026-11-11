import { test } from "node:test";
import assert from "node:assert/strict";
import { repairHistory, toTurns } from "./parent";

test("a conversation left on a tool call is closed off before it's replayed", () => {
  const fixed = repairHistory([
    { role: "user", content: "Can I pay weekly?" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_family_overview", input: {} }] },
  ]);
  assert.equal(fixed.length, 2);
  assert.equal(fixed[1].role, "assistant");
  assert.equal(typeof fixed[1].content, "string");
});

test("a conversation left on tool results gets a closing reply", () => {
  const fixed = repairHistory([
    { role: "user", content: "Hi" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_family_overview", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
  ]);
  assert.equal(fixed.length, 4);
  assert.equal(fixed[3].role, "assistant");
});

test("a finished conversation is left alone", () => {
  const ok = [
    { role: "user" as const, content: "Hi" },
    { role: "assistant" as const, content: "Hello" },
  ];
  assert.deepEqual(repairHistory(ok), ok);
  assert.deepEqual(repairHistory([]), []);
});

test("Slip's notes beside a tool call stay hidden when it replies after the tools", () => {
  const turns = toTurns([
    { role: "user", content: "Leo can't come to camp any more." },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Parent clearly said Leo. Proceed." },
        { type: "tool_use", id: "t1", name: "request_withdrawal", input: {} },
      ],
    },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Sent" }] },
    { role: "assistant", content: [{ type: "text", text: "I've asked the office to take Leo off the camp." }] },
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[1].text, "I've asked the office to take Leo off the camp.");
  assert.deepEqual(turns[1].actions, ["Asked the office to approve a withdrawal"]);
});

test("a reply with nothing after the tools still shows what Slip wrote", () => {
  const turns = toTurns([
    { role: "user", content: "Hi" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "t1", name: "get_family_overview", input: {} },
      ],
    },
  ]);
  assert.equal(turns[1].text, "Let me check.");
});
