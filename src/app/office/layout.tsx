import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { DEMO_FAMILY_TOKEN, DEMO_SCHOOL_ID } from "@/lib/demo/seed";
import { Logo } from "@/components/ui";
import { NavLink } from "./nav-link";

export default function OfficeLayout({ children }: LayoutProps<"/office">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4 pt-3 sm:h-14 sm:flex-nowrap sm:pt-0 sm:px-6">
          <Link href="/" aria-label="Slip home">
            <Logo />
          </Link>
          <span className="hidden text-sm text-ink-faint sm:inline">Bellbird Primary · School office</span>
          {/* On a phone the parent view sits beside the logo, so the tabs below have room. */}
          <Link
            href={`/family/${DEMO_FAMILY_TOKEN}`}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-ink-faint hover:text-ink sm:hidden"
          >
            View as parent
          </Link>
          {/* On a phone the nav gets its own row and scrolls sideways. */}
          <nav className="-mx-4 flex w-full items-center gap-0.5 overflow-x-auto px-3 py-2 text-sm whitespace-nowrap sm:mx-0 sm:ml-auto sm:w-auto sm:px-0 sm:py-0">
            <NavLink href="/office/ledger">Ledger</NavLink>
            <NavLink href="/office/events">Events</NavLink>
            <NavLink href="/office/approvals">
              Approvals
              <Suspense fallback={null}>
                <PendingCount />
              </Suspense>
            </NavLink>
            <NavLink href="/office/activity">Activity</NavLink>
            <Link
              href={`/family/${DEMO_FAMILY_TOKEN}`}
              className="ml-2 hidden rounded-lg border border-line px-3 py-1.5 text-ink-soft hover:border-ink-faint hover:text-ink sm:inline-flex"
            >
              View as parent
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

async function PendingCount() {
  await connection();
  const count = await db.approvalItem.count({
    where: { schoolId: DEMO_SCHOOL_ID, status: { in: ["PENDING", "FAILED"] } },
  });
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-waiting px-1.5 text-xs font-semibold text-white">
      {count}
    </span>
  );
}
