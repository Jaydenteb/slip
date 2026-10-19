"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Suspense, type ReactNode } from "react";

const base = "inline-flex items-center rounded-lg px-3 py-1.5 transition-colors";
const idle = "text-ink-soft hover:bg-line/50 hover:text-ink";

// The highlight depends on the URL, which is only known at request time, so the
// plain link is the prerendered fallback and the highlighted one streams in.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={clsx(base, idle)}>
          {children}
        </Link>
      }
    >
      <ActiveLink href={href}>{children}</ActiveLink>
    </Suspense>
  );
}

function ActiveLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link href={href} className={clsx(base, active ? "bg-brand-tint font-medium text-brand-strong" : idle)}>
      {children}
    </Link>
  );
}
