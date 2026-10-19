import { test } from "node:test";
import assert from "node:assert/strict";
import { safeCsvCell } from "./csv";

test("formulas are neutralised", () => {
  assert.equal(safeCsvCell('=HYPERLINK("http://evil","Click")'), `'=HYPERLINK("http://evil","Click")`);
  assert.equal(safeCsvCell("+1+cmd"), "'+1+cmd");
  assert.equal(safeCsvCell("@SUM(A1)"), "'@SUM(A1)");
});

test("ordinary text and numbers, including negative amounts, are left alone", () => {
  assert.equal(safeCsvCell("Year 4 Camp"), "Year 4 Camp");
  assert.equal(safeCsvCell(-85), "-85");
  assert.equal(safeCsvCell("-12.50"), "-12.50");
  assert.equal(safeCsvCell(null), "");
});
