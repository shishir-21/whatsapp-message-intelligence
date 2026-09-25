import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        WhatsApp Message Intelligence
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Review AI analyses of WhatsApp messages that need a human decision.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/messages"
          className="inline-block rounded-md bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Message history
        </Link>
        <Link
          href="/reviews"
          className="inline-block rounded-md border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Open review dashboard
        </Link>
      </div>
    </main>
  );
}
