"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { clsx } from "clsx";
import { LEDGER_COLUMNS, type LedgerColumn, type LedgerRow, type LedgerStatus } from "@/lib/ledger/columns";
import { toGridState } from "@/lib/ledger/query";
import { Button, Card } from "@/components/ui";
import { askLedgerAction } from "../actions";

const modules = [AllCommunityModule];

// Row grouping is an AG Grid Enterprise feature; without a licence, "group by" sorts instead.
const CAN_GROUP = false;

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 14,
  accentColor: "#0e7c66",
  foregroundColor: "#1c2321",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#faf8f4",
  headerTextColor: "#4b5652",
  borderColor: "#e7e3da",
  rowHoverColor: "#f4f1ea",
  wrapperBorderRadius: 12,
  browserColorScheme: "light",
  cellHorizontalPadding: 14,
});

const STATUS_STYLE: Record<LedgerStatus, string> = {
  "Not invoiced": "bg-line/60 text-ink-soft",
  "Waiting for approval": "bg-waiting-tint text-waiting",
  Unpaid: "bg-info-tint text-info",
  "Part paid": "bg-waiting-tint text-waiting",
  Paid: "bg-brand-tint text-brand-strong",
  Cancelled: "bg-line/60 text-ink-soft",
  Refunded: "bg-line/60 text-ink-soft",
};

function StatusCell({ value }: ICellRendererParams<LedgerRow, LedgerStatus>) {
  if (!value) return null;
  return <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[value])}>{value}</span>;
}

function FlagCell({ value, data }: ICellRendererParams<LedgerRow, string>) {
  if (!data || value !== "Yes") return <span className="text-ink-faint">{value === "No" ? "–" : value}</span>;
  return <span className="font-medium text-waiting">Yes</span>;
}

const money = (p: ValueFormatterParams<LedgerRow, number>) =>
  p.value == null ? "" : p.value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function col(field: LedgerColumn, extra: Partial<ColDef<LedgerRow>> = {}): ColDef<LedgerRow> {
  return { field, colId: field, headerName: LEDGER_COLUMNS[field].label, ...extra };
}

export function LedgerGrid({ initialRows }: { initialRows: LedgerRow[] }) {
  const apiRef = useRef<GridApi<LedgerRow> | null>(null);
  const [rows, setRows] = useState(initialRows);
  const [question, setQuestion] = useState("");
  const [view, setView] = useState<{ explanation: string; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  const [totals, setTotals] = useState<LedgerRow[]>([]);

  const columnDefs = useMemo<ColDef<LedgerRow>[]>(
    () => [
      col("student", { pinned: "left", minWidth: 170 }),
      col("className", { width: 90 }),
      col("year", { width: 80, hide: true }),
      col("family", { width: 120 }),
      col("event", { minWidth: 200, flex: 1 }),
      col("amount", { width: 130, valueFormatter: money, type: "rightAligned" }),
      col("paid", { width: 130, valueFormatter: money, type: "rightAligned", enableCellChangeFlash: true }),
      col("owing", { width: 130, valueFormatter: money, type: "rightAligned", enableCellChangeFlash: true }),
      col("status", { width: 175, cellRenderer: StatusCell, enableCellChangeFlash: true }),
      col("depositPaid", { width: 130, enableCellChangeFlash: true }),
      col("onPlan", { width: 130, cellRenderer: FlagCell }),
      col("needsSupport", { width: 110, cellRenderer: FlagCell }),
      col("consent", { width: 110, enableCellChangeFlash: true }),
      col("lastPayment", { width: 135, cellDataType: "dateString" }),
      col("paidBy", { width: 120 }),
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<LedgerRow>>(
    () => ({ sortable: true, filter: true, resizable: true, filterParams: { maxNumConditions: 6 } }),
    [],
  );

  // Live updates: re-read the ledger every few seconds. Rows keep their ids, so AG Grid
  // only re-renders what changed and flashes the cells whose values moved.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/office/ledger/data", { cache: "no-store" });
        if (res.ok) setRows(await res.json());
      } catch {
        // Offline for a moment; the next tick catches up.
      }
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // A totals row for whatever is currently showing, so filtered views add up too.
  const updateTotals = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    let amount = 0;
    let paid = 0;
    let count = 0;
    api.forEachNodeAfterFilter((n) => {
      if (!n.data) return;
      amount += n.data.amount;
      paid += n.data.paid;
      count++;
    });
    setTotals([
      {
        id: "totals",
        student: `${count} ${count === 1 ? "student" : "students"}`,
        amount: Math.round(amount * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        owing: Math.round((amount - paid) * 100) / 100,
      } as LedgerRow,
    ]);
  }, []);

  function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setError(null);
    startAsking(async () => {
      const result = await askLedgerAction(q);
      if (!result.ok) return setError(result.error);
      const state = toGridState(result.data, { canGroup: CAN_GROUP });
      const api = apiRef.current;
      if (!api) return;
      api.applyColumnState({ state: state.columnState, defaultState: { sort: null } });
      api.setFilterModel(state.filterModel);
      setView({ explanation: result.data.explanation, skipped: state.skipped });
    });
  }

  function clearView() {
    const api = apiRef.current;
    if (!api) return;
    api.setFilterModel(null);
    api.applyColumnState({ defaultState: { sort: null }, state: columnDefs.map((c) => ({ colId: c.colId!, hide: c.colId === "year" })) });
    setView(null);
    setQuestion("");
  }

  const summary = useMemo(() => {
    const billed = rows.filter((r) => !["Not invoiced", "Waiting for approval", "Cancelled"].includes(r.status));
    const amount = billed.reduce((n, r) => n + r.amount, 0);
    const paid = billed.reduce((n, r) => n + r.paid, 0);
    return {
      amount,
      paid,
      unpaid: billed.filter((r) => r.status === "Unpaid").length,
      plans: new Set(rows.filter((r) => r.onPlan === "Yes").map((r) => r.family)).size,
      support: new Set(rows.filter((r) => r.needsSupport === "Yes").map((r) => r.family)).size,
    };
  }, [rows]);

  const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Collected" value={aud(summary.paid)} sub={`of ${aud(summary.amount)} invoiced`} />
        <Stat label="Not started paying" value={String(summary.unpaid)} sub="students" />
        <Stat label="On a payment plan" value={String(summary.plans)} sub="families" />
        <Stat label="Need support" value={String(summary.support)} sub="families to follow up" tone={summary.support ? "waiting" : undefined} />
      </div>

      <Card className="p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor="ask" className="sr-only">
            Ask the ledger
          </label>
          <div className="relative flex-1">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-brand">
              ✦
            </span>
            <input
              id="ask"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Ask the ledger, e.g. who in 4B hasn't paid the camp deposit?"
              className="h-11 w-full rounded-lg border border-line bg-paper pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button type="submit" disabled={asking || !question.trim()} className="h-11">
            {asking ? "Working it out…" : "Ask"}
          </Button>
        </form>
        {!view && !asking && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["Who in 4B hasn't paid the camp deposit yet?", "Who owes more than $200?", "Who paid cash?", "Who hasn't given consent?"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
                className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink-faint hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {view && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-brand-tint px-3 py-1 font-medium text-brand-strong">✦ {view.explanation}</span>
            {view.skipped.length > 0 && <span className="text-ink-faint">Couldn&rsquo;t apply: {view.skipped.join("; ")}</span>}
            <button type="button" onClick={clearView} className="text-ink-soft underline-offset-2 hover:text-ink hover:underline">
              Show everyone
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <AgGridProvider modules={modules}>
        <div style={{ height: "max(480px, calc(100vh - 380px))" }}>
          <AgGridReact<LedgerRow>
            theme={theme}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(p) => p.data.id}
            pinnedBottomRowData={totals}
            onGridReady={(e) => {
              apiRef.current = e.api;
              updateTotals();
            }}
            onModelUpdated={updateTotals}
            animateRows
            overlayNoRowsTemplate="No students match. Try asking another way, or show everyone."
          />
        </div>
      </AgGridProvider>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "slip-ledger.csv" })}>
          Export CSV
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "waiting" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={clsx("mt-0.5 text-2xl font-semibold tracking-tight", tone === "waiting" && "text-waiting")}>{value}</p>
      <p className="text-xs text-ink-soft">{sub}</p>
    </Card>
  );
}
