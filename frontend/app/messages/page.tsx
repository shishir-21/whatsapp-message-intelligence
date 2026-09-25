"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MessageHistoryCard from "@/components/messages/MessageHistoryCard";
import { getMessages } from "@/lib/api";
import StatusSidebar from "@/components/messages/StatusSidebar";
import { useWhatsAppControls } from "@/components/whatsapp/WhatsAppContext";
import WhatsAppPanel from "@/components/whatsapp/WhatsAppPanel";
import {
  CATEGORY_FILTERS,
  CATEGORY_FILTER_LABELS,
  STATUSES,
  STATUS_LABELS,
  type CategoryFilter,
  type HistoryMessage,
  type ProcessingStatus,
} from "@/lib/messageTypes";

type LoadState = "loading" | "error" | "ready";

export default function MessagesPage() {
  // The gate remounts this page when the selected group changes, so state and
  // fetches always belong to the current group.
  const groupId = useWhatsAppControls()?.group.id;
  const [status, setStatus] = useState<ProcessingStatus>("PENDING");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  // Bumped by Retry to re-run the fetch effect for the same filters.
  const [attempt, setAttempt] = useState(0);

  // Changing the status resets the category filter to All.
  function selectStatus(next: ProcessingStatus) {
    if (next === status) return;
    setState("loading");
    setStatus(next);
    setCategory("ALL");
  }

  function selectCategory(next: CategoryFilter) {
    if (next === category) return;
    setState("loading");
    setCategory(next);
  }

  function retry() {
    setState("loading");
    setAttempt((n) => n + 1);
  }

  const load = useCallback(() => getMessages(status, category, groupId), [status, category, groupId]);

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
    <div className="flex flex-1 flex-col sm:flex-row">
      <StatusSidebar statuses={STATUSES} selected={status} onSelect={selectStatus} footer={<WhatsAppPanel />} />
      <main className="mx-auto w-full min-w-0 max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Message History</h1>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{STATUS_LABELS[status]}</p>
        </div>
        <Link
          href="/reviews"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Pending reviews
        </Link>
      </div>

      <div role="group" aria-label="Filter by category" className="mb-5 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => selectCategory(option)}
            aria-pressed={category === option}
            className={
              category === option
                ? "rounded-full bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }
          >
            {CATEGORY_FILTER_LABELS[option]}
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
          {category === "ALL"
            ? `No ${STATUS_LABELS[status].toLowerCase()} messages found.`
            : `No ${STATUS_LABELS[status].toLowerCase()} messages found for ${CATEGORY_FILTER_LABELS[category]}.`}
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
    </div>
  );
}
