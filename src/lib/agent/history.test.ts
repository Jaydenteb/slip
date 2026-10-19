import { test } from "node:test";
import assert from "node:assert/strict";
import { repairHistory } from "./parent";

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
