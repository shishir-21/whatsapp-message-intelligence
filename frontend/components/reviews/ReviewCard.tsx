"use client";

import { useState } from "react";
import PriorityBadge from "@/components/PriorityBadge";
import { categoryLabel, toStringList } from "@/lib/reviewForm";
import type { CorrectionPayload, Review } from "@/lib/reviewTypes";
import ReviewForm from "./ReviewForm";

interface ReviewCardProps {
  review: Review;
  // Both reject with an Error whose message is shown to the reviewer.
  onApprove: (id: string) => Promise<void>;
  onCorrect: (id: string, payload: CorrectionPayload) => Promise<void>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="col-span-2 break-words text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

export default function ReviewCard({ review, onApprove, onCorrect }: ReviewCardProps) {
  const { message, aiAnalysis: ai } = review;
  const [correcting, setCorrecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (approving) return;
    setApproving(true);
    setError(null);
    try {
      await onApprove(review.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
      setApproving(false);
    }
  }

  return (
    <article className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="text-xs text-zinc-500">Review {review.id}</header>

      <section className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Original message
        </h3>
        <p className="whitespace-pre-wrap break-words text-sm text-zinc-900 dark:text-zinc-100">
          {message.content}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {message.senderName ?? "Unknown sender"} · {formatDate(message.sentAt)}
        </p>
      </section>

      <section className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          AI analysis — becomes the final result if approved
        </h3>
        <dl className="space-y-1.5">
          <Row label="Category">{categoryLabel(ai.category)}</Row>
          <Row label="Confidence">{Math.round(ai.confidence * 100)}%</Row>
          <Row label="Summary">{ai.summary ?? "—"}</Row>
          <Row label="Priority"><PriorityBadge priority={ai.priority} /></Row>
          <Row label="Action required">{ai.actionRequired ? "Yes" : "No"}</Row>
          <Row label="Requested action">{ai.requestedAction ?? "—"}</Row>
          <Row label="People">{list(ai.people)}</Row>
          <Row label="Deadline">{formatDate(ai.deadline)}</Row>
          <Row label="Entities">{list(toStringList(ai.entities))}</Row>
        </dl>
      </section>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        <span className="font-semibold">Why review: </span>
        {review.reason}
        <span className="mt-1 block text-xs opacity-75">
          Queued {formatDate(review.createdAt)}
        </span>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {correcting ? (
        <ReviewForm
          analysis={ai}
          onSubmit={(payload) => onCorrect(review.id, payload)}
          onCancel={() => setCorrecting(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {approving ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCorrecting(true);
            }}
            disabled={approving}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Correct
          </button>
        </div>
      )}
    </article>
  );
}
