"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ReviewCard from "@/components/reviews/ReviewCard";
import { approveReview, correctReview, getReviews } from "@/lib/api";
import type { CorrectionPayload, Review } from "@/lib/reviewTypes";

type LoadState = "loading" | "error" | "ready";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setReviews(await getReviews());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // Initial fetch. State starts as "loading", so no synchronous setState here.
    let cancelled = false;
    getReviews()
      .then((data) => {
        if (cancelled) return;
        setReviews(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleApprove(id: string) {
    await approveReview(id);
    setReviews((prev) => prev.filter((r) => r.id !== id));
    setNotice("Review approved. The AI analysis is now the final result.");
  }

  async function handleCorrect(id: string, payload: CorrectionPayload) {
    await correctReview(id, payload);
    setReviews((prev) => prev.filter((r) => r.id !== id));
    setNotice("Correction saved as the final result.");
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Pending reviews</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/messages"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Message history
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={state === "loading"}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {state === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-3 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">
            ×
          </button>
        </div>
      )}

      {state === "loading" && reviews.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">Loading reviews…</p>
      )}

      {state === "error" && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>Unable to load reviews. Please try again.</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {state === "ready" && reviews.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 py-12 text-center text-zinc-500 dark:border-zinc-700">
          No pending reviews
        </p>
      )}

      {state !== "error" && reviews.length > 0 && (
        <div className="space-y-5">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onApprove={handleApprove}
              onCorrect={handleCorrect}
            />
          ))}
        </div>
      )}
    </main>
  );
}
