import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { formatDayRange } from "@/lib/format";
import { formatMoney, toCents } from "@/lib/money";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import type { EventStatus } from "@prisma/client";

export const metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      <PageHeader
        title="Events"
        description="Field trips, camps and fundraisers. Describe one in plain English and Slip sets up the payments."
        actions={<LinkButton href="/office/events/new">New event</LinkButton>}
      />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <EventList />
      </Suspense>
    </>
  );
}

const statusBadge: Record<EventStatus, { label: string; tone: "neutral" | "brand" | "waiting" | "danger" }> = {
  DRAFT: { label: "Not invoiced yet", tone: "waiting" },
  OPEN: { label: "Collecting", tone: "brand" },
  CLOSED: { label: "Closed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

async function EventList() {
  await connection();
  const events = await db.event.findMany({
    where: { schoolId: DEMO_SCHOOL_ID },
    orderBy: { createdAt: "desc" },
    include: {
      school: { select: { currency: true } },
      _count: { select: { enrolments: true } },
      invoices: { select: { total: true, amountPaid: true, status: true } },
    },
  });

  if (!events.length) {
    return (
      <EmptyState title="No events yet">
        Try <Link className="font-medium text-brand underline-offset-2 hover:underline" href="/office/events/new">a new event</Link>, for example &ldquo;Year 4 camp at Bellbird Creek, 12–14 March, $285&rdquo;.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      {events.map((e) => {
        const live = e.invoices.filter((i) => i.status !== "PROPOSED" && i.status !== "CANCELLED");
        const billed = live.reduce((n, i) => n + toCents(i.total), 0);
        const paid = live.reduce((n, i) => n + toCents(i.amountPaid), 0);
        const badge = statusBadge[e.status];
        return (
          <Link key={e.id} href={`/office/events/${e.id}`} className="group">
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors group-hover:border-ink-faint">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.title}</p>
                <p className="text-sm text-ink-soft">
                  {formatDayRange(e.startsOn, e.endsOn)} · {e._count.enrolments} students
                </p>
              </div>
              {billed > 0 && (
                <div className="w-48">
                  <div className="flex justify-between text-xs text-ink-soft">
                    <span>{formatMoney(paid, e.school.currency)} paid</span>
                    <span>{Math.round((paid / billed) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(paid / billed) * 100}%` }} />
                  </div>
                </div>
              )}
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
