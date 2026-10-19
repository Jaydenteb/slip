import { type Cents } from "../money";

export type FeeInput = { label: string; amount: Cents; deposit?: Cents | null };

export type EnrolledStudent = {
  studentId: string;
  firstName: string;
  familyId: string;
  attending: boolean;
};

export type InvoiceDraft = {
  familyId: string;
  lines: { studentId: string; label: string; amount: Cents }[];
  total: Cents;
  // Smallest first payment PayPal will accept; null means pay in full.
  minimumPayment: Cents | null;
};

// One invoice per family: siblings on the same event become lines on one invoice,
// so a family with two kids at camp gets one bill, not two.
export function buildInvoiceDrafts(students: EnrolledStudent[], fees: FeeInput[]): InvoiceDraft[] {
  const byFamily = new Map<string, EnrolledStudent[]>();
  for (const s of students) {
    if (!s.attending) continue;
    const list = byFamily.get(s.familyId) ?? [];
    list.push(s);
    byFamily.set(s.familyId, list);
  }

  const drafts: InvoiceDraft[] = [];
  for (const [familyId, kids] of byFamily) {
    const lines = kids.flatMap((kid) =>
      fees.map((fee) => ({
        studentId: kid.studentId,
        label: `${fee.label} – ${kid.firstName}`,
        amount: fee.amount,
      })),
    );
    const total = lines.reduce((sum, l) => sum + l.amount, 0);
    const hasDeposit = fees.some((f) => f.deposit != null);
    const minimumPayment = hasDeposit
      ? kids.length * fees.reduce((sum, f) => sum + (f.deposit ?? f.amount), 0)
      : null;
    drafts.push({ familyId, lines, total, minimumPayment });
  }
  return drafts.sort((a, b) => a.familyId.localeCompare(b.familyId));
}
