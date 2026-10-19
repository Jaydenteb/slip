import { z } from "zod/v4";
import { LEDGER_COLUMN_IDS, LEDGER_COLUMNS, type LedgerColumn } from "./columns";

// What Claude returns for "Ask the ledger": a description of a view of the grid, using
// only real column ids. toGridState() turns it into AG Grid's own filter model and
// column state, which the grid applies directly.

const column = z.enum(LEDGER_COLUMN_IDS as [LedgerColumn, ...LedgerColumn[]]);

const TEXT_MATCHES = ["equals", "notEqual", "contains", "notContains", "startsWith", "blank", "notBlank"] as const;
const NUMBER_MATCHES = ["equals", "notEqual", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual", "inRange", "blank", "notBlank"] as const;

export const LedgerQuerySchema = z.object({
  explanation: z.string().describe("One short sentence describing the view, e.g. 'Year 4 camp: 4B students who haven't paid the deposit'"),
  filters: z.array(
    z.object({
      column,
      match: z.enum([...new Set([...TEXT_MATCHES, ...NUMBER_MATCHES])] as [string, ...string[]]),
      values: z
        .array(z.string())
        .describe("Values to match. Several values mean 'any of these' (or 'none of these' for notEqual/notContains). Empty for blank/notBlank."),
      valueTo: z.string().nullable().describe("Upper bound for inRange, otherwise null"),
    }),
  ),
  sort: z.array(z.object({ column, direction: z.enum(["asc", "desc"]) })),
  columns: z.array(column).nullable().describe("Columns to show, in a sensible order; null to show the usual columns"),
  groupBy: column.nullable().describe("Column to group rows by, e.g. className; null for no grouping"),
});

export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;

type Condition = { filterType: string; type: string; filter?: string | number; filterTo?: number; dateFrom?: string; dateTo?: string };
type ColumnFilter = Condition | { filterType: string; operator: "AND" | "OR"; conditions: Condition[] };

export type GridState = {
  filterModel: Record<string, ColumnFilter>;
  columnState: { colId: string; sort?: "asc" | "desc" | null; sortIndex?: number | null; hide?: boolean; rowGroup?: boolean }[];
  skipped: string[]; // parts of the query that couldn't be applied
};

const NO_VALUE = new Set(["blank", "notBlank"]);

function condition(col: LedgerColumn, match: string, value: string | undefined, valueTo: string | null): Condition | null {
  const kind = LEDGER_COLUMNS[col].kind;
  if (kind === "text") {
    if (!(TEXT_MATCHES as readonly string[]).includes(match)) return null;
    return NO_VALUE.has(match) ? { filterType: "text", type: match } : { filterType: "text", type: match, filter: value ?? "" };
  }
  if (!(NUMBER_MATCHES as readonly string[]).includes(match)) return null;
  if (kind === "date") {
    if (NO_VALUE.has(match)) return { filterType: "date", type: match };
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const c: Condition = { filterType: "date", type: match, dateFrom: `${value} 00:00:00` };
    if (match === "inRange" && valueTo) c.dateTo = `${valueTo} 00:00:00`;
    return c;
  }
  if (NO_VALUE.has(match)) return { filterType: "number", type: match };
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const c: Condition = { filterType: "number", type: match, filter: n };
  if (match === "inRange") {
    const to = Number(valueTo);
    if (!Number.isFinite(to)) return null;
    c.filterTo = to;
  }
  return c;
}

export function toGridState(q: LedgerQuery, opts: { canGroup: boolean }): GridState {
  const filterModel: GridState["filterModel"] = {};
  const skipped: string[] = [];

  for (const f of q.filters) {
    const values = NO_VALUE.has(f.match) ? [undefined] : f.values.length ? f.values : [undefined];
    const conditions = values.map((v) => condition(f.column, f.match, v, f.valueTo)).filter((c): c is Condition => c !== null);
    if (!conditions.length) {
      skipped.push(`${LEDGER_COLUMNS[f.column].label} ${f.match} ${f.values.join(", ")}`.trim());
      continue;
    }
    const negative = f.match.startsWith("not");
    const filter: ColumnFilter =
      conditions.length === 1
        ? conditions[0]
        : { filterType: conditions[0].filterType, operator: negative ? "AND" : "OR", conditions };
    filterModel[f.column] = filter;
  }

  // Sorting: grouping falls back to sorting by that column first when grouping isn't available.
  const sorts = [...q.sort];
  if (q.groupBy && !opts.canGroup && !sorts.some((s) => s.column === q.groupBy)) {
    sorts.unshift({ column: q.groupBy, direction: "asc" });
  }

  const shown = q.columns ? new Set<LedgerColumn>(["student", ...q.columns]) : null;
  if (shown && q.groupBy) shown.add(q.groupBy);
  for (const s of sorts) shown?.add(s.column);
  for (const f of Object.keys(filterModel)) shown?.add(f as LedgerColumn);

  const columnState = LEDGER_COLUMN_IDS.map((colId) => {
    const sortIndex = sorts.findIndex((s) => s.column === colId);
    return {
      colId,
      sort: sortIndex >= 0 ? sorts[sortIndex].direction : null,
      sortIndex: sortIndex >= 0 ? sortIndex : null,
      ...(shown ? { hide: !shown.has(colId) } : {}),
      ...(opts.canGroup ? { rowGroup: q.groupBy === colId } : {}),
    };
  });

  return { filterModel, columnState, skipped };
}
