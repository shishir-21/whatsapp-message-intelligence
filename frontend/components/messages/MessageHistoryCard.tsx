"use client";

import { useState } from "react";
import type { HistoryMessage, ProcessingStatus, ResultFields } from "@/lib/messageTypes";
import PriorityBadge from "@/components/PriorityBadge";
import { categoryLabel, toStringList } from "@/lib/reviewForm";

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  PENDING: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="col-span-2 break-words text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function ResultRows({ result }: { result: ResultFields }) {
  return (
    <dl className="space-y-1.5">
      <Row label="Category">{categoryLabel(result.category)}</Row>
      <Row label="Summary">{result.summary ?? "—"}</Row>
      <Row label="Priority"><PriorityBadge priority={result.priority} /></Row>
      <Row label="Action required">{result.actionRequired ? "Yes" : "No"}</Row>
      <Row label="Requested action">{result.requestedAction ?? "—"}</Row>
      <Row label="People">{list(result.people)}</Row>
      <Row label="Deadline">{formatDate(result.deadline)}</Row>
      <Row label="Entities">{list(toStringList(result.entities))}</Row>
    </dl>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{children}</h4>
  );
}

function placeholder(message: HistoryMessage): string {
  if (message.messageType === "IMAGE") return "[Image message]";
  if (message.messageType === "TEXT") return "[No text]";
  return `[${titleCase(message.messageType)} message]`;
}

export default function MessageHistoryCard({ message }: { message: HistoryMessage }) {
  const [open, setOpen] = useState(false);
  const { aiAnalysis: ai, review, finalResult: final } = message;
  const body = message.content.trim();

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          {message.senderName ?? "Unknown sender"}
        </span>
        <time dateTime={message.sentAt} className="text-xs text-zinc-500">
          {formatDate(message.sentAt)}
        </time>
      </header>

      <section className="mt-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Original message · {titleCase(message.messageType)}
        </h3>
        {message.messageType === "IMAGE" && (
          <p className="text-sm italic text-zinc-500">[Image message]</p>
        )}
        {body ? (
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-900 dark:text-zinc-100">
            {body}
          </p>
        ) : (
          message.messageType !== "IMAGE" && (
            <p className="text-sm italic text-zinc-500">{placeholder(message)}</p>
          )
        )}
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[message.processingStatus]}`}
        >
          Processing: {titleCase(message.processingStatus)}
        </span>
        {message.processingStatus === "FAILED" && (
          <span className="text-xs text-zinc-500">
            {message.processingAttempts} attempt{message.processingAttempts === 1 ? "" : "s"}
          </span>
        )}
        {review && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Review: {titleCase(review.status)}
          </span>
        )}
      </div>

      <section className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          AI result
        </h3>
        {ai ? (
          <>
            <p className="text-sm text-zinc-900 dark:text-zinc-100">
              {categoryLabel(ai.category)} · {Math.round(ai.confidence * 100)}% ·{" "}
              {ai.priority ? <PriorityBadge priority={ai.priority} /> : "No priority"}
            </p>
            {ai.summary && (
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{ai.summary}</p>
            )}
          </>
        ) : (
          <p className="text-sm italic text-zinc-500">
            {message.processingStatus === "FAILED" ? "AI processing failed." : "No AI result yet."}
          </p>
        )}
      </section>

      <section className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Final result
        </h3>
        {final ? (
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            {categoryLabel(final.category)}
            {final.priority && (
              <>
                {" · "}
                <PriorityBadge priority={final.priority} />
              </>
            )}
            {review?.status === "CORRECTED"
              ? " · corrected by a human"
              : review?.status === "APPROVED"
                ? " · approved by a human"
                : " · accepted automatically"}
          </p>
        ) : (
          <p className="text-sm italic text-zinc-500">
            {review?.status === "PENDING" ? "Awaiting human review." : "Not finalized yet."}
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
      >
        {open ? "Hide details" : "Show details"}
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div>
            <SectionTitle>Message</SectionTitle>
            <dl className="space-y-1.5">
              <Row label="Sender ID">{message.senderId}</Row>
              <Row label="WhatsApp ID">{message.whatsappMessageId}</Row>
              <Row label="Stored">{formatDate(message.createdAt)}</Row>
              <Row label="Attempts">{message.processingAttempts}</Row>
            </dl>
          </div>
          {ai && (
            <div>
              <SectionTitle>AI analysis</SectionTitle>
              <dl className="mb-1.5 space-y-1.5">
                <Row label="Confidence">{Math.round(ai.confidence * 100)}%</Row>
                <Row label="Analysed">{formatDate(ai.createdAt)}</Row>
              </dl>
              <ResultRows result={ai} />
            </div>
          )}
          {review && (
            <div>
              <SectionTitle>Review</SectionTitle>
              <dl className="space-y-1.5">
                <Row label="Status">{titleCase(review.status)}</Row>
                <Row label="Reason">{review.reason}</Row>
                <Row label="Reviewed">{formatDate(review.reviewedAt)}</Row>
              </dl>
            </div>
          )}
          {final && (
            <div>
              <SectionTitle>Final result</SectionTitle>
              <dl className="mb-1.5 space-y-1.5">
                <Row label="Finalized">{formatDate(final.finalizedAt)}</Row>
              </dl>
              <ResultRows result={final} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
