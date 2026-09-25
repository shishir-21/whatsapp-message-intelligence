"use client";

interface Props {
  busy: boolean;
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutDialog({ busy, failed, onCancel, onConfirm }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Logout WhatsApp"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Logout WhatsApp?</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Are you sure you want to disconnect your WhatsApp account from this application?
        </p>
        {failed && <p className="mt-2 text-sm text-red-600">Unable to logout. Please try again.</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}
