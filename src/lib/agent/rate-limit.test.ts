import { test } from "node:test";
import assert from "node:assert/strict";
import { allow, clientIp } from "./rate-limit";

test("the limiter allows up to the limit, then stops", () => {
  const key = `test:${Math.random()}`;
  assert.equal(allow(key, 2, 60_000), true);
  assert.equal(allow(key, 2, 60_000), true);
  assert.equal(allow(key, 2, 60_000), false);
});

test("the client address comes from Cloudflare's header before X-Forwarded-For", () => {
  const h = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
  assert.equal(clientIp(h), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(new Headers()), "local");
});
