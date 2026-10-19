import Image from "next/image";
import Link from "next/link";
import { DEMO_FAMILY_TOKEN } from "@/lib/demo/seed";
import { Logo } from "@/components/ui";
import { ResetDemo } from "./reset-demo";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-20">
      <Logo className="text-xl" />
      <h1 className="mt-10 max-w-2xl animate-rise text-4xl font-semibold tracking-tight sm:text-5xl">
        Less chasing money. More teaching.
      </h1>
      <p className="mt-5 max-w-2xl animate-rise text-lg text-ink-soft [animation-delay:80ms]">
        Slip is an AI agent that runs school field-trip and camp payments on PayPal. The office describes an event in plain
        English; Slip drafts the invoices, answers parents&rsquo; questions and keeps the books, and a person approves
        anything that reaches a family or moves money.
      </p>

      <div className="mt-12 grid animate-rise gap-4 [animation-delay:160ms] sm:grid-cols-2">
        <Link
          href="/office/events"
          className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand"
        >
          <p className="text-sm font-medium text-brand">Try it as</p>
          <p className="mt-1 text-xl font-semibold">The school office</p>
          <p className="mt-2 text-sm text-ink-soft">
            Set up a camp in one sentence, approve the invoices, and watch payments arrive.
          </p>
          <p className="mt-6 text-sm font-medium text-ink group-hover:text-brand">Open the office →</p>
        </Link>
        <Link
          href={`/family/${DEMO_FAMILY_TOKEN}`}
          className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand"
        >
          <p className="text-sm font-medium text-brand">Try it as</p>
          <p className="mt-1 text-xl font-semibold">A parent</p>
          <p className="mt-2 text-sm text-ink-soft">
            The Nguyen family, with Ava in 4B and Leo in 4A. See what you owe, ask questions, and pay with PayPal.
          </p>
          <p className="mt-6 text-sm font-medium text-ink group-hover:text-brand">Open the family page →</p>
        </Link>
      </div>

      <figure className="mt-14">
        <Image
          src="/hero.png"
          width={1800}
          height={1100}
          sizes="(min-width: 960px) 896px, 100vw"
          alt="The school office's ledger showing who has paid for Year 4 camp, beside a parent's phone where Slip answers a question about money being tight"
          className="h-auto w-full"
        />
        <figcaption className="mt-3 text-center text-sm text-ink-faint">
          The office ledger, live from PayPal, and a parent asking Slip for help on their phone.
        </figcaption>
      </figure>

      <div className="mt-12 grid gap-4 border-t border-line pt-6">
        <p className="text-sm text-ink-faint">
          A demo school with made-up families. Payments run in the PayPal sandbox; no real money moves.
        </p>
        <ResetDemo />
      </div>
    </main>
  );
}
