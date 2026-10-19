import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { formatMoment } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every decision and every PayPal call, in order. Slip's agents can propose; only an approval can make a PayPal call."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ActivityLog />
      </Suspense>
    </>
  );
}

const actorLabel: Record<string, string> = {
  executor: "Slip (approved)",
  office: "School office",
  "office-agent": "Slip",
  "parent-agent": "Slip (parent chat)",
  webhook: "PayPal",
  sync: "Sync",
};

function describe(action: string) {
  const [area, verb] = action.split(".");
  if (area === "paypal") return verb.replaceAll("_", " ");
  if (area === "approval") return `${verb} an approval`;
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

async function ActivityLog() {
  await connection();
  const actions = await db.agentAction.findMany({
    where: { schoolId: DEMO_SCHOOL_ID },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { approvalItem: { select: { title: true } } },
  });
  if (!actions.length) return <EmptyState title="Nothing yet">Activity appears as soon as Slip proposes something or a payment arrives.</EmptyState>;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-ink-faint">
          <tr>
            <th className="px-5 py-3 font-medium">When</th>
            <th className="px-5 py-3 font-medium">Who</th>
            <th className="px-5 py-3 font-medium">What</th>
            <th className="px-5 py-3 font-medium">For</th>
            <th className="px-5 py-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {actions.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-2.5 whitespace-nowrap text-ink-soft">{formatMoment(a.createdAt)}</td>
              <td className="px-5 py-2.5 whitespace-nowrap">{actorLabel[a.actor] ?? a.actor}</td>
              <td className="px-5 py-2.5">
                {a.action.startsWith("paypal.") ? (
                  <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs">{a.action.slice(7)}</code>
                ) : (
                  describe(a.action)
                )}
              </td>
              <td className="max-w-xs truncate px-5 py-2.5 text-ink-soft">{a.approvalItem?.title ?? ""}</td>
              <td className="px-5 py-2.5">{a.ok ? <Badge tone="brand">OK</Badge> : <Badge tone="danger">Failed</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
