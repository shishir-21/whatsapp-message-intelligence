"use client";

import { useState, type FormEvent } from "react";
import {
  CATEGORIES,
  PRIORITIES,
  buildCorrectionPayload,
  initialFormValues,
  validateForm,
  type CorrectionFormValues,
  type FormErrors,
} from "@/lib/reviewForm";
import type { AIAnalysis, CorrectionPayload } from "@/lib/reviewTypes";

interface ReviewFormProps {
  analysis: AIAnalysis;
  // Must reject with an Error whose message is shown to the reviewer.
  onSubmit: (payload: CorrectionPayload) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default function ReviewForm({ analysis, onSubmit, onCancel }: ReviewFormProps) {
  const [values, setValues] = useState<CorrectionFormValues>(() => initialFormValues(analysis));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof CorrectionFormValues>(key: K, value: CorrectionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const found = validateForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(buildCorrectionPayload(values));
    } catch (err) {
      // Form stays open with the reviewer's values intact.
      setSubmitError(err instanceof Error ? err.message : "Correction failed.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30"
    >
      <p className="text-sm text-amber-900 dark:text-amber-200">
        You are correcting the <strong>final human-approved interpretation</strong>. The original
        WhatsApp message and the AI analysis are not changed.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category}>
          <select
            className={inputClass}
            value={values.category}
            disabled={submitting}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Select a category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority" error={errors.priority}>
          <select
            className={inputClass}
            value={values.priority}
            disabled={submitting}
            onChange={(e) => set("priority", e.target.value)}
          >
            <option value="">Select a priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Summary" error={errors.summary}>
        <textarea
          className={inputClass}
          rows={3}
          maxLength={2000}
          value={values.summary}
          disabled={submitting}
          onChange={(e) => set("summary", e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={values.actionRequired}
          disabled={submitting}
          onChange={(e) => set("actionRequired", e.target.checked)}
        />
        Action required
      </label>

      <Field label="Requested action" hint="Leave empty if none.">
        <textarea
          className={inputClass}
          rows={2}
          maxLength={2000}
          value={values.requestedAction}
          disabled={submitting}
          onChange={(e) => set("requestedAction", e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="People" hint="Comma separated.">
          <input
            className={inputClass}
            value={values.people}
            disabled={submitting}
            onChange={(e) => set("people", e.target.value)}
          />
        </Field>

        <Field label="Entities" hint="Comma separated.">
          <input
            className={inputClass}
            value={values.entities}
            disabled={submitting}
            onChange={(e) => set("entities", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Deadline" error={errors.deadline} hint="Optional. Your local time.">
        <input
          type="datetime-local"
          className={inputClass}
          value={values.deadline}
          disabled={submitting}
          onChange={(e) => set("deadline", e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reviewer name (optional)">
          <input
            className={inputClass}
            maxLength={100}
            value={values.reviewerName}
            disabled={submitting}
            onChange={(e) => set("reviewerName", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          className={inputClass}
          rows={2}
          maxLength={2000}
          value={values.notes}
          disabled={submitting}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>

      {submitError && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit correction"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
