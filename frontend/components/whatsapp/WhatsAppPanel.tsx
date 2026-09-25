"use client";

import { useWhatsAppControls } from "./WhatsAppContext";

const linkButton =
  "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800";

// Compact connection summary shown at the bottom of the sidebar.
export default function WhatsAppPanel() {
  const controls = useWhatsAppControls();
  if (!controls) return null;

  return (
    <section
      aria-label="WhatsApp"
      className="mt-auto border-t border-zinc-200 p-2 dark:border-zinc-800 sm:p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">WhatsApp</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Connected
      </p>
      <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={controls.group.name}>
        {controls.group.name}
      </p>
      <p className="text-xs text-zinc-500">Selected group</p>
      <div className="mt-2 flex gap-1 sm:flex-col">
        <button type="button" onClick={controls.changeGroup} className={`${linkButton} text-zinc-700 dark:text-zinc-200`}>
          Change Group
        </button>
        <button type="button" onClick={controls.logout} className={`${linkButton} text-red-700 dark:text-red-400`}>
          Logout WhatsApp
        </button>
      </div>
    </section>
  );
}
