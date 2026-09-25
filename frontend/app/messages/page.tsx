"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MessageHistoryCard from "@/components/messages/MessageHistoryCard";
import { getMessages } from "@/lib/api";
import { STATUS_FILTERS, type HistoryMessage, type StatusFilter } from "@/lib/messageTypes";

type LoadState = "loading" | "error" | "ready";

const FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default function MessagesPage() {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  // Bumped by Retry to re-run the fetch effect for the same filter.
  const [attempt, setAttempt] = useState(0);

  function selectFilter(next: StatusFilter) {
    if (next === filter) return;
    setState("loading");
    setFilter(next);
  }

  function retry() {
    setState("loading");
    setAttempt((n) => n + 1);
  }

  const load = useCallback(() => getMessages(filter), [filter]);

  useEffect(() => {
    // Ignore the response of a superseded request (fast filter switching).
    let cancelled = false;
    load()
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Message History</h1>
        </div>
        <Link
          href="/reviews"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Pending reviews
        </Link>
      </div>

      <div role="group" aria-label="Filter by processing status" className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => selectFilter(status)}
            aria-pressed={filter === status}
            className={
              filter === status
                ? "rounded-full bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }
          >
            {FILTER_LABELS[status]}
          </button>
        ))}
      </div>

      {state === "loading" && (
        <p className="py-10 text-center text-sm text-zinc-500">Loading messages...</p>
      )}

      {state === "error" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>Unable to load messages</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {state === "ready" && messages.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 py-12 text-center text-zinc-500 dark:border-zinc-700">
          {filter === "ALL" ? "No messages found." : "No messages found for this filter."}
        </p>
      )}

      {state === "ready" && messages.length > 0 && (
        <div className="space-y-5">
          {messages.map((message) => (
            <MessageHistoryCard key={message.id} message={message} />
          ))}
        </div>
      )}
    </main>
  );
}
