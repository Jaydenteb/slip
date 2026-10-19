import { notFound } from "next/navigation";
import { Suspense } from "react";
import { after, connection } from "next/server";
import { syncOpenInvoices } from "@/lib/payments/sync";
import { db } from "@/lib/db";
import { formatDay, formatDayRange } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/money";
import { invoiceStatus } from "@/lib/status";
import { Badge, Card, Logo, Skeleton } from "@/components/ui";
import { toTurns } from "@/lib/agent/parent";
import type Anthropic from "@anthropic-ai/sdk";
import { Chat } from "./chat";
import { ConsentTick } from "./consent";

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
        include: {
          event: { include: { feeItems: true, enrolments: { select: { studentId: true, consentGiven: true } } } },
          lines: { include: { student: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      chatThreads: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!family) notFound();
  // A parent coming back from paying should see it: catch up with PayPal in the background.
  after(() => syncOpenInvoices({ familyId: family.id, maxAgeMs: 30_000 }).catch(() => undefined));
  const currency = family.school.currency;
  const firstName = family.contactName.split(" ")[0];
  const turns = toTurns((family.chatThreads[0]?.messages ?? []) as unknown as Anthropic.Beta.Messages.BetaMessageParam[]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName}</h1>
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
            const plan = (inv.plan as { instalments?: { dueOn: string; amount: string }[] } | null)?.instalments ?? null;
            const next = plan ? nextInstalment(plan, paid) : null;
            const s = invoiceStatus[inv.status];
            // Everyone withdrawn: nothing to pay, just say what happened to the money.
            if (inv.lines.length === 0) {
              return (
                <Card key={inv.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{inv.event.title}</p>
                      <p className="text-sm text-ink-soft">{formatDayRange(inv.event.startsOn, inv.event.endsOn)}</p>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-ink-soft">
                    Nobody from your family is going any more.{" "}
                    {toCents(inv.amountRefunded) > 0
                      ? `${formatMoney(toCents(inv.amountRefunded), currency)} has been refunded.`
                      : paid > 0
                        ? "Your refund is on its way."
                        : "There's nothing to pay."}
                  </p>
                </Card>
              );
            }
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
                    {toCents(inv.amountRefunded) > 0 && (
                      <p className="text-ink-soft">Refunded {formatMoney(toCents(inv.amountRefunded), currency)}</p>
                    )}
                    {owing > 0 && next && (
                      <p className="text-ink-soft">
                        Next payment {formatMoney(next.amount, currency)} by {formatDay(new Date(`${next.dueOn}T00:00:00Z`))}
                      </p>
                    )}
                    {owing > 0 && !plan && inv.minimumPayment && paid === 0 && fee?.depositDueOn && (
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
                {plan && (
                  <div className="mt-4 rounded-lg border border-brand/20 bg-brand-tint/40 px-4 py-3 text-sm">
                    <p className="font-medium text-brand-strong">Your payment plan</p>
                    <ul className="mt-1 grid gap-0.5 text-ink-soft">
                      {plan.map((p) => (
                        <li key={p.dueOn} className="flex justify-between tabular-nums">
                          <span>{formatDay(new Date(`${p.dueOn}T00:00:00Z`))}</span>
                          <span>{formatMoney(toCents(p.amount), currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {inv.event.needsConsent && inv.lines.length > 0 && (
                  <div className="mt-4 grid gap-2 rounded-lg bg-paper px-4 py-3">
                    {inv.lines.map((l) => (
                      <ConsentTick
                        key={l.id}
                        token={token}
                        eventId={inv.eventId}
                        studentId={l.studentId}
                        name={l.student.firstName}
                        given={inv.event.enrolments.find((e) => e.studentId === l.studentId)?.consentGiven ?? false}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <Chat token={token} initialTurns={turns} firstName={firstName} />
      </div>
    </>
  );
}

// The first instalment not yet covered by what's been paid, with what's left of it.
function nextInstalment(plan: { dueOn: string; amount: string }[], paidCents: number) {
  let covered = paidCents;
  for (const p of plan) {
    const amount = toCents(p.amount);
    if (covered < amount) return { dueOn: p.dueOn, amount: amount - covered };
    covered -= amount;
  }
  return null;
}
