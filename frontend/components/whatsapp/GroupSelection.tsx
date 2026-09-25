"use client";

import { useEffect, useState } from "react";
import { getWhatsAppGroups, selectWhatsAppGroup } from "@/lib/api";
import type { SelectedGroup, WhatsAppGroup } from "@/lib/whatsappTypes";

interface Props {
  onSelected: (group: SelectedGroup) => void;
  // When changing an existing selection: preselect it and allow cancelling.
  current?: SelectedGroup;
  onCancel?: () => void;
}

export default function GroupSelection({ onSelected, current, onCancel }: Props) {
  const [groups, setGroups] = useState<WhatsAppGroup[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWhatsAppGroups()
      .then((data) => {
        if (cancelled) return;
        setGroups(data);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function submit() {
    if (!selectedId || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      onSelected(await selectWhatsAppGroup(selectedId));
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  const content = (
    <div className="mx-auto flex w-full max-w-lg flex-col justify-center gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Select a WhatsApp Group
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose the group Message Intelligence should monitor.
        </p>
      </div>

      {loadFailed ? (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-700">
          <p className="text-zinc-700 dark:text-zinc-300">Unable to load your groups.</p>
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="mt-3 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
          >
            Try Again
          </button>
        </div>
      ) : groups === null ? (
        <p className="text-sm text-zinc-500">Loading groups...</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No groups found on this WhatsApp account.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {groups.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <input
                  type="radio"
                  name="group"
                  value={g.id}
                  checked={selectedId === g.id}
                  onChange={() => setSelectedId(g.id)}
                  className="accent-emerald-700"
                />
                <span className="text-zinc-900 dark:text-zinc-100">{g.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {saveFailed && (
        <p className="text-sm text-red-600">Could not save your selection. Please try again.</p>
      )}
      <button
        type="button"
        disabled={!selectedId || saving}
        onClick={submit}
        className="rounded-md bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : "Continue"}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      )}
    </div>
  );

  if (onCancel) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change group"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
          {content}
        </div>
      </div>
    );
  }

  return <main className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6">{content}</main>;
}
