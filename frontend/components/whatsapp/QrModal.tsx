"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactNode } from "react";
import { getWhatsAppQr } from "@/lib/api";
import type { WhatsAppStatusResponse } from "@/lib/whatsappTypes";

interface Props {
  status: WhatsAppStatusResponse | null;
  // The connect request itself failed (backend unreachable).
  requestFailed: boolean;
  onClose: () => void;
  onRetry: () => void;
}

const STEPS = [
  "Open WhatsApp on your phone",
  "Go to Linked devices",
  "Tap Link a device",
  "Scan this QR code",
];

function Spinner() {
  return (
    <span
      className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-700"
      aria-hidden
    />
  );
}

// The QR is kept in component state only (never localStorage) and is re-read
// whenever the backend reports a status change, since WhatsApp rotates it.
export default function QrModal({ status, requestFailed, onClose, onRetry }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const current = status?.status;
  const updatedAt = status?.updatedAt;

  useEffect(() => {
    if (current !== "QR_REQUIRED") return;
    let cancelled = false;
    getWhatsAppQr()
      .then((value) => {
        if (!cancelled) setQr(value);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [current, updatedAt]);

  // Close a moment after success so the confirmation is seen.
  useEffect(() => {
    if (current !== "READY") return;
    const t = setTimeout(onClose, 1500);
    return () => clearTimeout(t);
  }, [current, onClose]);

  const failed =
    requestFailed ||
    current === "AUTH_FAILURE" ||
    (current === "DISCONNECTED" && status?.hasError === true);

  let body: ReactNode;
  if (failed) {
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Unable to connect WhatsApp
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Please try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Try Again
        </button>
      </div>
    );
  } else if (current === "READY") {
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          WhatsApp Connected
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your WhatsApp account is connected successfully.
        </p>
      </div>
    );
  } else if (current === "AUTHENTICATED") {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Spinner />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          WhatsApp authenticated. Finishing up...
        </p>
      </div>
    );
  } else if (current === "QR_REQUIRED" && qr) {
    body = (
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Connect WhatsApp</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <QRCodeSVG value={qr} size={224} marginSize={1} title="WhatsApp link QR code" />
        </div>
        <ol className="w-full list-inside list-decimal space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Spinner />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Preparing QR code...</p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect WhatsApp"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        {body}
        {current !== "READY" && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
