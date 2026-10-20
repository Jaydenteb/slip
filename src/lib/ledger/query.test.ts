import { test } from "node:test";
import assert from "node:assert/strict";
import { LedgerQuerySchema, toGridState, type LedgerQuery } from "./query";

const base: LedgerQuery = { explanation: "", filters: [], sort: [], columns: null, groupBy: null };

test("the demo question becomes AG Grid filters and sorting", () => {
  // "Who in 4B hasn't paid the camp deposit yet?"
  const state = toGridState(
    {
      ...base,
      filters: [
        { column: "className", match: "equals", values: ["4B"], valueTo: null },
        { column: "event", match: "contains", values: ["Camp"], valueTo: null },
        { column: "depositPaid", match: "equals", values: ["No"], valueTo: null },
      ],
      sort: [{ column: "owing", direction: "desc" }],
    },
    { canGroup: false },
  );
  assert.deepEqual(state.filterModel, {
    className: { filterType: "text", type: "equals", filter: "4B" },
    event: { filterType: "text", type: "contains", filter: "Camp" },
    depositPaid: { filterType: "text", type: "equals", filter: "No" },
  });
  const owing = state.columnState.find((c) => c.colId === "owing")!;
  assert.equal(owing.sort, "desc");
  assert.equal(owing.sortIndex, 0);
  assert.deepEqual(state.skipped, []);
});

test("several values become OR, negative matches become AND", () => {
  const state = toGridState(
    {
      ...base,
      filters: [
        { column: "className", match: "equals", values: ["4A", "4B"], valueTo: null },
        { column: "status", match: "notEqual", values: ["Paid", "Cancelled"], valueTo: null },
      ],
    },
    { canGroup: false },
  );
  assert.deepEqual(state.filterModel.className, {
    filterType: "text",
    operator: "OR",
    conditions: [
      { filterType: "text", type: "equals", filter: "4A" },
      { filterType: "text", type: "equals", filter: "4B" },
    ],
  });
  assert.equal((state.filterModel.status as { operator: string }).operator, "AND");
});

test("numbers and dates are typed for AG Grid", () => {
  const state = toGridState(
    {
      ...base,
      filters: [
        { column: "owing", match: "greaterThan", values: ["100"], valueTo: null },
        { column: "lastPayment", match: "inRange", values: ["2026-10-01"], valueTo: "2026-10-31" },
      ],
    },
    { canGroup: false },
  );
  assert.deepEqual(state.filterModel.owing, { filterType: "number", type: "greaterThan", filter: 100 });
  assert.deepEqual(state.filterModel.lastPayment, {
    filterType: "date",
    type: "inRange",
    dateFrom: "2026-10-01 00:00:00",
    dateTo: "2026-10-31 00:00:00",
  });
});

test("nonsense is skipped, never applied", () => {
  const state = toGridState(
    {
      ...base,
      filters: [
        { column: "owing", match: "greaterThan", values: ["lots"], valueTo: null },
        { column: "className", match: "lessThan", values: ["4B"], valueTo: null },
      ],
    },
    { canGroup: false },
  );
  assert.deepEqual(state.filterModel, {});
  assert.equal(state.skipped.length, 2);
});

test("group by falls back to sorting when grouping isn't available", () => {
  const plain = toGridState({ ...base, groupBy: "className" }, { canGroup: false });
  const cls = plain.columnState.find((c) => c.colId === "className")!;
  assert.equal(cls.sort, "asc");
  assert.equal("rowGroup" in cls, false);
  assert.deepEqual(plain.skipped, ["grouping by Class (sorted by Class instead)"]);

  const grouped = toGridState({ ...base, groupBy: "className" }, { canGroup: true });
  assert.equal(grouped.columnState.find((c) => c.colId === "className")!.rowGroup, true);
  assert.deepEqual(grouped.skipped, []);
});

test("chosen columns are shown along with anything filtered or sorted", () => {
  const state = toGridState(
    {
      ...base,
      columns: ["family", "owing"],
      filters: [{ column: "className", match: "equals", values: ["4B"], valueTo: null }],
    },
    { canGroup: false },
  );
  const visible = state.columnState.filter((c) => !c.hide).map((c) => c.colId);
  assert.deepEqual(visible.sort(), ["className", "family", "owing", "student"]);
});

test("the schema rejects columns that don't exist", () => {
  const bad = LedgerQuerySchema.safeParse({ ...base, sort: [{ column: "password", direction: "asc" }] });
  assert.equal(bad.success, false);
});

test("columns come back after a question that hid them, and sorted columns come first", () => {
  const state = toGridState({ ...base, columns: null, sort: [{ column: "owing", direction: "desc" }] }, { canGroup: false });
  assert.deepEqual(
    state.columnState.slice(0, 2).map((c) => c.colId),
    ["student", "owing"],
  );
  const hidden = state.columnState.filter((c) => c.hide).map((c) => c.colId);
  assert.deepEqual(hidden, ["year"]);
});
