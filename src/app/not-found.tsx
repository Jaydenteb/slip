import Link from "next/link";
import { buttonClass, Card } from "@/components/ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-semibold">That page isn&rsquo;t here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          If you followed a family link from the school, it may have been replaced. The school office can send you the
          current one.
        </p>
        <div className="mt-6">
          <Link href="/" className={buttonClass("ghost")}>
            Back to the start
          </Link>
        </div>
      </Card>
    </main>
  );
}
