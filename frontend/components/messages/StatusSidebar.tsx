"use client";

import { useState } from "react";
import { STATUS_LABELS, type ProcessingStatus } from "@/lib/messageTypes";

interface Props {
  statuses: readonly ProcessingStatus[];
  selected: ProcessingStatus;
  onSelect: (status: ProcessingStatus) => void;
}

// Collapsible left navigation; the processing status is the primary filter.
export default function StatusSidebar({ statuses, selected, onSelect }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <nav
      aria-label="Message status"
      className={`shrink-0 border-b border-zinc-200 dark:border-zinc-800 sm:border-b-0 sm:border-r ${
        open ? "sm:w-56" : "sm:w-14"
      }`}
    >
      <div className="flex items-center gap-2 p-2 sm:p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={open}
          className="rounded-md p-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
        {open && <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status</span>}
      </div>
      {open && (
        <ul className="flex gap-1 overflow-x-auto px-2 pb-2 sm:flex-col sm:px-3 sm:pb-3">
          {statuses.map((status) => (
            <li key={status}>
              <button
                type="button"
                onClick={() => onSelect(status)}
                aria-current={selected === status ? "page" : undefined}
                className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium ${
                  selected === status
                    ? "bg-emerald-700 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
