// The ledger's columns, shared by the grid and by "Ask the ledger" so the AI can only
// refer to columns that exist.

export const LEDGER_STATUSES = [
  "Not invoiced",
  "Waiting for approval",
  "Unpaid",
  "Part paid",
  "Paid",
  "Cancelled",
  "Refunded",
  "Withdrawn",
] as const;

export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export type LedgerRow = {
  id: string; // enrolment id
  student: string;
  className: string;
  year: number;
  family: string;
  event: string;
  amount: number; // dollars, this student's share
  paid: number;
  owing: number;
  status: LedgerStatus;
  depositPaid: "Yes" | "No" | "No deposit" | "Not going";
  onPlan: "Yes" | "No";
  needsSupport: "Yes" | "No";
  consent: "Yes" | "No" | "Not needed";
  lastPayment: string | null; // YYYY-MM-DD in Melbourne
  paidBy: string; // "PayPal", "Cash", "PayPal + Cash" or ""
};

type ColumnKind = "text" | "number" | "date";

export const LEDGER_COLUMNS = {
  student: { label: "Student", kind: "text", about: "Student's first and last name" },
  className: { label: "Class", kind: "text", about: "Class, e.g. 4B" },
  year: { label: "Year", kind: "number", about: "Year level, e.g. 4" },
  family: { label: "Family", kind: "text", about: "Family surname" },
  event: { label: "Event", kind: "text", about: "Event title" },
  amount: { label: "Amount", kind: "number", about: "What this student's place costs, in dollars" },
  paid: { label: "Paid", kind: "number", about: "Paid so far for this student, in dollars" },
  owing: { label: "Owing", kind: "number", about: "Still owing for this student, in dollars" },
  status: { label: "Status", kind: "text", about: `One of: ${LEDGER_STATUSES.join(", ")}` },
  depositPaid: { label: "Deposit paid", kind: "text", about: "Yes, No, No deposit, or Not going (withdrawn)" },
  onPlan: { label: "Payment plan", kind: "text", about: "Yes if the family has an agreed payment plan" },
  needsSupport: { label: "Support", kind: "text", about: "Yes if the family has asked for help and the office hasn't followed up yet" },
  consent: { label: "Consent", kind: "text", about: "Yes, No, or Not needed" },
  lastPayment: { label: "Last payment", kind: "date", about: "Date of the most recent payment (YYYY-MM-DD)" },
  paidBy: { label: "Paid by", kind: "text", about: "PayPal, Cash, or both" },
} as const satisfies Record<Exclude<keyof LedgerRow, "id">, { label: string; kind: ColumnKind; about: string }>;

export type LedgerColumn = keyof typeof LEDGER_COLUMNS;
export const LEDGER_COLUMN_IDS = Object.keys(LEDGER_COLUMNS) as LedgerColumn[];
