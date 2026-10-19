import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { formatDay, formatDayRange } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/money";
import { invoiceStatus } from "@/lib/status";
import { Badge, Card, Logo, Skeleton } from "@/components/ui";

export const metadata = { title: "Your family", robots: { index: false } };

export default function FamilyPage({ params }: PageProps<"/family/[token]">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Logo />
          <span className="ml-3 text-sm text-ink-faint">Bellbird Primary School</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Family params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Family({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  // Everything on this page is scoped to the family that owns this link.
  const family = await db.family.findUnique({
    where: { linkToken: token },
    include: {
      school: true,
      students: { include: { classroom: true }, orderBy: { firstName: "asc" } },
      invoices: {
        where: { status: { not: "PROPOSED" } },
        include: { event: { include: { feeItems: true } }, lines: { include: { student: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!family) notFound();
  const currency = family.school.currency;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hi {family.contactName.split(" ")[0]}</h1>
      <p className="mt-1 text-ink-soft">
        {family.students.map((s) => `${s.firstName} (${s.classroom.name})`).join(" and ")} at {family.school.name}.
      </p>

      <h2 className="mt-8 mb-3 font-semibold">Events and payments</h2>
      {family.invoices.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-ink-soft">Nothing to pay right now.</Card>
      ) : (
        <div className="grid gap-4">
          {family.invoices.map((inv) => {
            const total = toCents(inv.total);
            const paid = toCents(inv.amountPaid);
            const owing = total - paid;
            const fee = inv.event.feeItems[0];
            const s = invoiceStatus[inv.status];
            return (
              <Card key={inv.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{inv.event.title}</p>
                    <p className="text-sm text-ink-soft">{formatDayRange(inv.event.startsOn, inv.event.endsOn)}</p>
                  </div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <p className="mt-3 text-sm text-ink-soft">{inv.event.description}</p>
                <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
                  {inv.lines.map((l) => (
                    <li key={l.id} className="flex justify-between py-2">
                      <span>{l.label}</span>
                      <span className="tabular-nums">{formatMoney(toCents(l.amount), currency)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                  <div className="text-sm">
                    <p>
                      <span className="text-ink-soft">Paid</span>{" "}
                      <span className="font-medium tabular-nums">{formatMoney(paid, currency)}</span>
                      <span className="text-ink-soft"> of {formatMoney(total, currency)}</span>
                    </p>
                    {owing > 0 && inv.minimumPayment && paid === 0 && fee?.depositDueOn && (
                      <p className="text-ink-soft">
                        Deposit {formatMoney(toCents(inv.minimumPayment), currency)} by {formatDay(fee.depositDueOn)}
                      </p>
                    )}
                    {owing > 0 && fee?.dueOn && <p className="text-ink-soft">Everything by {formatDay(fee.dueOn)}</p>}
                  </div>
                  {owing > 0 && inv.paypalPayerUrl && (
                    <a
                      href={inv.paypalPayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full bg-[#ffc439] px-5 py-2.5 text-sm font-semibold text-[#111] hover:brightness-95"
                    >
                      Pay with PayPal
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
