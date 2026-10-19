import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-semibold tracking-tight text-ink", className)}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="3" className="fill-brand" />
        <path d="M7 9h10M7 12.5h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.5 15.5l1.6 1.6 3-3.2" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Slip
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong disabled:bg-brand/50",
  secondary: "bg-surface text-ink border border-line hover:border-ink-faint disabled:text-ink-faint",
  ghost: "text-ink-soft hover:bg-line/50 hover:text-ink",
  danger: "bg-surface text-danger border border-line hover:border-danger/60",
};

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed",
    buttonStyles[variant],
    className,
  );
}

export function Button({ variant, className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant, className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-xl border border-line bg-surface", className)} {...props} />;
}

type Tone = "neutral" | "brand" | "waiting" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-line/60 text-ink-soft",
  brand: "bg-brand-tint text-brand-strong",
  waiting: "bg-waiting-tint text-waiting",
  danger: "bg-danger-tint text-danger",
  info: "bg-info-tint text-info",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-line/60", className)} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
    </Card>
  );
}
