"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { connectWhatsApp, getSelectedGroup, getWhatsAppStatus, logoutWhatsApp } from "@/lib/api";
import type { SelectedGroup, WhatsAppStatusResponse } from "@/lib/whatsappTypes";
import StatusSidebar from "@/components/messages/StatusSidebar";
import GroupSelection from "./GroupSelection";
import LogoutDialog from "./LogoutDialog";
import QrModal from "./QrModal";
import { WhatsAppContext, type WhatsAppControls } from "./WhatsAppContext";

// Fast while a connection is in progress, slow once connected (only to notice
// a later disconnect).
const POLL_ACTIVE_MS = 1500;
const POLL_CONNECTED_MS = 15000;
const POLL_OFFLINE_MS = 3000;

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 p-8 text-center shadow-sm dark:border-zinc-700">
        {children}
      </div>
    </main>
  );
}

const primaryButton =
  "rounded-md bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50";

// Gates the app behind the backend's WhatsApp state: connect (QR) -> select
// a group -> the app. All state is derived from the backend endpoints.
export default function WhatsAppConnection({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  // undefined = not checked yet, null = no group selected.
  const [group, setGroup] = useState<SelectedGroup | null | undefined>(undefined);
  const [groupCheckFailed, setGroupCheckFailed] = useState(false);
  const [groupAttempt, setGroupAttempt] = useState(0);
  const [wasReady, setWasReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let delay = POLL_OFFLINE_MS;
      try {
        const next = await getWhatsAppStatus();
        if (cancelled) return;
        if (next.status === "READY") setWasReady(true);
        setStatus(next);
        setOffline(false);
        delay = next.status === "READY" ? POLL_CONNECTED_MS : POLL_ACTIVE_MS;
      } catch {
        if (cancelled) return;
        setOffline(true);
      }
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const ready = status?.status === "READY";

  useEffect(() => {
    if (!ready || group !== undefined) return;
    let cancelled = false;
    getSelectedGroup()
      .then((g) => {
        if (cancelled) return;
        setGroup(g);
        setGroupCheckFailed(false);
      })
      .catch(() => {
        if (!cancelled) setGroupCheckFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, group, groupAttempt]);

  const startConnect = useCallback(async () => {
    setRequestFailed(false);
    setModalOpen(true);
    try {
      await connectWhatsApp();
    } catch {
      setRequestFailed(true);
    }
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const [changingGroup, setChangingGroup] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  const confirmLogout = useCallback(async () => {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      const next = await logoutWhatsApp();
      // Back to the disconnected state; the next poll keeps it in sync.
      setStatus(next);
      setWasReady(false);
      setGroup(undefined);
      setLogoutOpen(false);
    } catch {
      setLogoutFailed(true);
    }
    setLoggingOut(false);
  }, []);

  const controls = useMemo<WhatsAppControls | null>(
    () =>
      group
        ? {
            group,
            changeGroup: () => setChangingGroup(true),
            logout: () => {
              setLogoutFailed(false);
              setLogoutOpen(true);
            },
          }
        : null,
    [group],
  );

  if (status === null) {
    return (
      <CenteredCard>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {offline ? "Unable to reach the server. Retrying..." : "Loading..."}
        </p>
      </CenteredCard>
    );
  }

  const modal = modalOpen ? (
    <QrModal status={status} requestFailed={requestFailed} onClose={closeModal} onRetry={startConnect} />
  ) : null;

  // Sidebar plus content, shown until WhatsApp is connected and a group chosen.
  const shell = (title: string, content: ReactNode) => (
    <div className="flex flex-1 flex-col sm:flex-row">
      <StatusSidebar title={title} />
      <div className="flex min-w-0 flex-1 flex-col">{content}</div>
      {modal}
    </div>
  );

  if (ready) {
    if (groupCheckFailed) {
      return shell(
        "WhatsApp",
        <CenteredCard>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Unable to load your settings.</p>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setGroupCheckFailed(false);
              setGroupAttempt((n) => n + 1);
            }}
          >
            Try Again
          </button>
        </CenteredCard>,
      );
    }
    if (group === undefined) {
      return shell(
        "WhatsApp",
        <CenteredCard>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
        </CenteredCard>,
      );
    }
    if (group === null) {
      return shell("WhatsApp", <GroupSelection onSelected={setGroup} />);
    }
    return (
      <WhatsAppContext.Provider value={controls}>
        <Fragment key={group.id}>{children}</Fragment>
        {changingGroup && (
          <GroupSelection
            current={group}
            onCancel={() => setChangingGroup(false)}
            onSelected={(g) => {
              setGroup(g);
              setChangingGroup(false);
            }}
          />
        )}
        {logoutOpen && (
          <LogoutDialog
            busy={loggingOut}
            failed={logoutFailed}
            onCancel={() => setLogoutOpen(false)}
            onConfirm={confirmLogout}
          />
        )}
        {modal}
      </WhatsAppContext.Provider>
    );
  }

  const inProgress = status.status === "INITIALIZING" || status.status === "AUTHENTICATED";
  const disconnected = wasReady && status.status === "DISCONNECTED";

  let card: ReactNode;
  if (disconnected) {
    card = (
      <>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">WhatsApp disconnected</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The connection to your WhatsApp account was lost.
        </p>
        <button type="button" className={primaryButton} onClick={startConnect}>
          Reconnect WhatsApp
        </button>
      </>
    );
  } else if (status.status === "AUTH_FAILURE") {
    card = (
      <>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Unable to connect WhatsApp
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Please try again.</p>
        <button type="button" className={primaryButton} onClick={startConnect}>
          Try Again
        </button>
      </>
    );
  } else if (inProgress && !modalOpen) {
    card = (
      <>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Connecting to WhatsApp...
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">This usually takes a few seconds.</p>
      </>
    );
  } else {
    card = (
      <>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Connect your WhatsApp</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your WhatsApp account to use Message Intelligence.
        </p>
        <button type="button" className={primaryButton} onClick={startConnect}>
          Connect WhatsApp
        </button>
      </>
    );
  }


  return shell("Connect", <CenteredCard>{card}</CenteredCard>);
}
