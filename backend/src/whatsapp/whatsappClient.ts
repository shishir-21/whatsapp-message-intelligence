import { Client, LocalAuth } from "whatsapp-web.js";
import type { WhatsAppClientHandle, WhatsAppEventHandlers } from "./types";

export interface WhatsAppClientConfig {
  clientId: string;
  sessionPath: string;
  headless: boolean;
  // How many times WhatsApp Web is allowed to bounce through its own
  // logout/recovery cycle (/ -> ?post_logout=1 -> / -> ...) before we give
  // up and report a failure, instead of staying in INITIALIZING forever.
  // Each cycle is whatsapp-web.js's own internal recovery attempt
  // (node_modules/whatsapp-web.js/src/Client.js's framenavigated handler);
  // see the `disconnected` handler below for exactly what counts as a
  // cycle and when the counter resets. Configurable via
  // WHATSAPP_MAX_RECOVERY_CYCLES; default chosen to give WhatsApp Web a
  // few genuine retries (its own bootstrap is sometimes transiently flaky)
  // without leaving the app stuck indefinitely when it isn't.
  maxRecoveryCycles: number;
}

export function loadWhatsAppClientConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppClientConfig {
  return {
    clientId: env.WHATSAPP_CLIENT_ID || "whatsapp-message-intelligence",
    sessionPath: env.WHATSAPP_SESSION_PATH || ".wwebjs_auth",
    headless: env.WHATSAPP_HEADLESS !== "false",
    maxRecoveryCycles: Number(env.WHATSAPP_MAX_RECOVERY_CYCLES) || 3,
  };
}

const WHATSAPP_WEB_URL = "https://web.whatsapp.com/";

// Marks the Error we deliberately throw from afterBrowserInitialized() to
// abort whatsapp-web.js's in-flight recovery once we've decided to give up
// (see the `disconnected` handler / consumePendingGiveUp below). It surfaces
// through the same fire-and-forget path as the other recoverable rejections
// below, so onUnhandledRejection needs to recognize it too — otherwise this
// deliberate, controlled abort would itself crash the process.
const GIVE_UP_SENTINEL = "__whatsapp_client_give_up__:";

const trace = (message: string) => console.log(`[whatsapp:trace] +${Date.now() - traceStart}ms ${message}`);
let traceStart = Date.now();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Wires diagnostic listeners onto the page/browser as soon as they exist,
// and grants persistent-storage/notifications up front (the real fix for
// the storage-denial bootstrap failure traced earlier).
//
// This does NOT touch node_modules: whatsapp-web.js's own Client sets
// client.pupBrowser/client.pupPage and calls
// authStrategy.afterBrowserInitialized() before it navigates
// (node_modules/whatsapp-web.js/src/Client.js), so that hook is the one
// place we can attach listeners before the navigation we're watching for
// happens. LocalAuth itself leaves this hook empty, so wrapping it here
// changes nothing about LocalAuth's persistence behavior.
//
// Under the pinned commit (1780711a), this hook is NOT only called once at
// startup: Client.js's framenavigated handler also calls it again, on the
// SAME browser/page, as step 3 of its own internal logout-recovery sequence
// (emit DISCONNECTED -> authStrategy.logout() -> beforeBrowserInitialized()
// -> afterBrowserInitialized() -> re-inject). Two things follow from that,
// both handled below:
//   1. We must not re-attach a duplicate set of page/browser listeners on
//      every recovery cycle (isStalePage guards this).
//   2. `isDestroyed()` is checked after every await, because our own
//      destroy() can run concurrently with this async function (see the
//      race explained on the `disconnected` handler below), and if it does,
//      touching `browser`/`page` afterwards would be touching a
//      closed/detached one.
function instrumentedLocalAuth(
  options: { clientId: string; dataPath: string },
  getBrowser: () => import("puppeteer").Browser | undefined,
  isDestroyed: () => boolean,
  onBrowserDisconnected: () => void,
  onPageCrashed: (err: unknown) => void,
  // Checked at the very start of every afterBrowserInitialized call. See
  // the big comment on the `disconnected` handler in createWhatsAppClient
  // for why giving up has to happen from inside this specific hook rather
  // than reactively from the `disconnected` event itself.
  consumePendingGiveUp: () => string | undefined,
): LocalAuth {
  const authStrategy = new LocalAuth(options);
  const afterBrowserInitialized = authStrategy.afterBrowserInitialized.bind(authStrategy);
  let instrumentedPage: import("puppeteer").Page | undefined;

  authStrategy.afterBrowserInitialized = async () => {
    // Client.js's framenavigated handler always awaits
    // authStrategy.afterBrowserInitialized() (this hook) BEFORE its own
    // subsequent page.evaluate() call — whenever the disconnected('LOGOUT')
    // handler below decided to give up, this is guaranteed to run first,
    // on the exact same in-flight call chain, so throwing here aborts that
    // chain before it can reach the page. See GIVE_UP_SENTINEL.
    const pendingGiveUp = consumePendingGiveUp();
    if (pendingGiveUp !== undefined) {
      trace("afterBrowserInitialized: pending give-up, aborting whatsapp-web.js's in-flight recovery before it touches the page again");
      throw new Error(`${GIVE_UP_SENTINEL}${pendingGiveUp}`);
    }

    await afterBrowserInitialized();

    // From here on, every early exit MUST throw (not just `return`) if the
    // browser/page is gone. A silent `return` here would be treated by
    // whatsapp-web.js's caller (Client.js:554's
    // `await this.authStrategy.afterBrowserInitialized();`) as "this hook
    // succeeded" — and it would then continue straight to its own
    // page.evaluate() at Client.js:558 against whatever we just found
    // wasn't there, crashing with the same detached-frame/execution-context
    // error this whole fix exists to prevent. This was caught by testing:
    // an earlier version of this hook `return`ed here instead of throwing,
    // and still crashed. Throwing a GIVE_UP_SENTINEL-prefixed error is safe
    // to do unconditionally: giveUp() (which the resulting unhandledRejection
    // routes to) only acts once and no-ops if a failure was already
    // reported — see its `settled`/`destroyed` guard — so this never
    // produces a duplicate or contradictory status change, only a clean
    // abort of whatsapp-web.js's continuation.
    if (isDestroyed()) {
      trace("afterBrowserInitialized: client already destroyed, aborting whatsapp-web.js's in-flight recovery");
      throw new Error(`${GIVE_UP_SENTINEL}Client was destroyed during initialization.`);
    }

    const browser = getBrowser();
    if (!browser || !browser.connected) {
      trace("afterBrowserInitialized: no live browser handle, aborting whatsapp-web.js's in-flight recovery");
      throw new Error(`${GIVE_UP_SENTINEL}Browser was closed during initialization.`);
    }

    await browser
      .defaultBrowserContext()
      .overridePermissions(WHATSAPP_WEB_URL, ["persistent-storage", "notifications"])
      .catch((err) => trace(`overridePermissions failed (non-fatal): ${errorMessage(err)}`));

    // Re-check after the await above: destroy() may have run while we were
    // waiting on overridePermissions.
    if (isDestroyed() || !browser.connected) {
      trace("afterBrowserInitialized: browser gone after overridePermissions, aborting whatsapp-web.js's in-flight recovery");
      throw new Error(`${GIVE_UP_SENTINEL}Browser was closed during initialization.`);
    }

    const page = (await browser.pages().catch(() => []))[0];
    if (!page || page.isClosed()) {
      trace("afterBrowserInitialized: no live page handle, aborting whatsapp-web.js's in-flight recovery");
      throw new Error(`${GIVE_UP_SENTINEL}Page was closed during initialization.`);
    }

    if (page === instrumentedPage) {
      trace("afterBrowserInitialized: same page as before (recovery cycle), not re-attaching listeners");
      return;
    }
    instrumentedPage = page;

    trace(`afterBrowserInitialized: page url before navigation = ${page.url()}`);

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      trace(`framenavigated -> ${frame.url()}`);
    });
    page.on("close", () => trace("page CLOSED"));
    page.on("error", (err) => {
      // Puppeteer's Page "error" event = the Chromium renderer actually
      // crashed (distinct from a normal navigation/close). Purely
      // observational up to this point (trace only); onPageCrashed is the
      // one place this listener causes a lifecycle action, and that action
      // is itself just "report a failure" (see giveUp below) — it does not
      // touch the page/frame/browser, so it can't itself race or throw.
      trace(`page CRASHED: ${errorMessage(err)}`);
      onPageCrashed(err);
    });
    page.on("console", (msg) => {
      // WhatsApp Web logs its own internal bootstrap errors to the page
      // console right before it navigates away; this is what let us
      // identify the storage-persistence, push-notification and cache-init
      // failures traced earlier. Read-only: msg.text()/type() only.
      if (msg.type() === "error") trace(`page console error: ${msg.text().slice(0, 200)}`);
    });
    browser.on("disconnected", () => {
      // Real, final Puppeteer/Chromium-level disconnect (the OS browser
      // process is gone) — distinct from whatsapp-web.js's own client-level
      // 'disconnected'(LOGOUT) event, which fires mid-recovery while the
      // browser is still alive (handled separately below). This is the one
      // this task's THIRD point is about: without this, nothing ever told
      // the service the browser was gone, so status stayed INITIALIZING
      // forever after it happened on its own (observed in testing).
      trace("browser DISCONNECTED");
      onBrowserDisconnected();
    });
  };
  return authStrategy;
}

// whatsapp-web.js's own re-injection recovery re-injects from inside a raw
// `pupPage.on('framenavigated', async (frame) => { ...; await
// this.inject(); })` listener (node_modules/whatsapp-web.js/src/Client.js).
// Puppeteer/EventEmitter invokes that callback fire-and-forget: nothing
// awaits the promise it returns, so any rejection inside it can only reach
// us as a process-level unhandledRejection, never through a try/catch in
// whatsappService.ts. This is scoped as tightly as that constraint allows:
// it recognizes only the specific rejection shapes we've traced coming out
// of that exact code path, and anything else still hits Node's default
// unhandledRejection behavior (crash), so unrelated bugs stay loud instead
// of being silently absorbed here.
//
//  - 'auth timeout' / 'ready timeout' (Client.js: bare-string throws inside
//    inject() when WhatsApp Web's own page never becomes ready)
//  - "Attempted to use detached Frame" (Puppeteer, thrown from
//    Client.js:558's page.evaluate call) and the sibling "Target closed" /
//    "Connection closed" — these happen if inject() reaches into the
//    page/browser at the exact moment it's being torn down elsewhere. The
//    `disconnected` handler below removes the specific race we traced that
//    was causing this; this pattern match is a narrow defense-in-depth net
//    for the same class of lifecycle race, not a general catch-all.
const RECOVERABLE_INJECT_REJECTIONS = new Set(["auth timeout", "ready timeout"]);
// "Execution context was destroyed" is the original error this whole
// investigation started from; it's included here as defense-in-depth for
// the same reason "Attempted to use detached Frame" is — both are Puppeteer
// reporting that a page/frame it was mid-operation on disappeared.
const RECOVERABLE_PUPPETEER_LIFECYCLE_ERROR =
  /Attempted to use detached Frame|Target closed|Connection closed|Session closed|Execution context was destroyed/i;

function recoverableRejectionMessage(reason: unknown): string | undefined {
  if (typeof reason === "string" && RECOVERABLE_INJECT_REJECTIONS.has(reason)) return reason;
  if (reason instanceof Error) {
    if (reason.message.startsWith(GIVE_UP_SENTINEL)) {
      // Our own deliberate abort (see GIVE_UP_SENTINEL) — always
      // recoverable; giveUp() has already run by the time this reaches
      // here; its `settled` guard makes this a safe no-op.
      return reason.message.slice(GIVE_UP_SENTINEL.length);
    }
    if (RECOVERABLE_PUPPETEER_LIFECYCLE_ERROR.test(reason.message)) return reason.message;
  }
  return undefined;
}

// Builds a whatsapp-web.js Client with LocalAuth and translates its events
// into the application-level handlers.
export function createWhatsAppClient(
  config: WhatsAppClientConfig,
  handlers: WhatsAppEventHandlers,
): WhatsAppClientHandle {
  traceStart = Date.now();
  let destroyed = false;
  // True once we've reported a terminal failure for this client instance,
  // so a browser-disconnect/page-crash/rejection that follows (e.g. as a
  // side effect of our own destroy() below) can't report a second, possibly
  // contradictory failure. Each createWhatsAppClient() call gets its own
  // fresh closure (a new WhatsAppService generation), so this never needs
  // resetting within one client's lifetime.
  let settled = false;
  // Counts whatsapp-web.js's own logout/recovery cycles (see the
  // `disconnected` handler below for what counts as one). Resets to 0 on
  // qr/authenticated/ready — i.e. on any real forward progress — so a
  // client that struggled early but is now actually working isn't later
  // penalized for cycles from a different phase of its lifecycle.
  let recoveryCycles = 0;
  // Set by the `disconnected` handler when the recovery-cycle threshold is
  // hit; consumed by instrumentedLocalAuth's afterBrowserInitialized hook
  // on the very next call, which whatsapp-web.js's own in-flight recovery
  // is guaranteed to await before it would otherwise touch the page again.
  let pendingGiveUp: string | undefined;

  let client: Client;

  // Reports a definitive failure exactly once, through the existing
  // AUTH_FAILURE/DISCONNECTED states (WhatsAppEventHandlers is unchanged —
  // no new states or interfaces). whatsappService.ts's existing onAuthFailure/
  // onDisconnected handlers already call discardClient() -> our destroy()
  // below, so this does not need to (and does not) close the browser itself.
  function giveUp(reason: string, kind: "auth-failure" | "disconnected") {
    if (settled || destroyed) return;
    settled = true;
    trace(`giving up (${kind}): ${reason}`);
    if (kind === "disconnected") handlers.onDisconnected(reason);
    else handlers.onAuthFailure(reason);
  }

  client = new Client({
    authStrategy: instrumentedLocalAuth(
      { clientId: config.clientId, dataPath: config.sessionPath },
      () => client.pupBrowser,
      () => destroyed,
      () => giveUp("Browser disconnected unexpectedly before WhatsApp Web finished initializing.", "disconnected"),
      (err) => giveUp(`WhatsApp Web's page crashed during initialization: ${errorMessage(err)}`, "disconnected"),
      () => {
        const reason = pendingGiveUp;
        pendingGiveUp = undefined;
        return reason;
      },
    ),
    puppeteer: {
      headless: config.headless,
    },
  });

  client.on("qr", (qr: string) => {
    trace("client event: qr");
    recoveryCycles = 0; // real progress: forget earlier failed bootstrap attempts
    handlers.onQr(qr);
  });
  client.on("authenticated", () => {
    trace("client event: authenticated");
    recoveryCycles = 0;
    handlers.onAuthenticated();
  });
  client.on("auth_failure", (message: string) => {
    trace(`client event: auth_failure (${message})`);
    handlers.onAuthFailure(message);
  });
  client.on("ready", () => {
    trace("client event: ready");
    recoveryCycles = 0;
    handlers.onReady();
  });
  client.on("disconnected", (reason: unknown) => {
    const reasonStr = String(reason);
    trace(`client event: disconnected (${reasonStr})`);

    // THE DETACHED-FRAME RACE THIS FIXES (unchanged from the previous fix):
    // under the pinned commit, Client.js's framenavigated handler emits
    // this exact event as step 1 of its own internal logout-recovery
    // sequence — it still has several more awaits to go (authStrategy
    // hooks, then a page.evaluate at Client.js:558, then possibly a fresh
    // inject()) that need the SAME browser/page to stay alive. Forwarding
    // this straight to handlers.onDisconnected() would make
    // whatsappService.ts call our destroy() (browser.close()) immediately
    // — winning the race against whatsapp-web.js's own in-flight
    // continuation and crashing on "Attempted to use detached Frame".
    //
    // browser.isConnected() tells the two cases apart: if the browser is
    // still alive, whatsapp-web.js is (or may be) still using it for that
    // recovery attempt, so we do not forward/destroy here.
    const browserStillAlive = client.pupBrowser?.isConnected() ?? false;
    if (reasonStr === "LOGOUT" && browserStillAlive) {
      recoveryCycles++;
      trace(
        `disconnected(LOGOUT) while browser is still connected: recovery cycle ${recoveryCycles}/${config.maxRecoveryCycles}, letting whatsapp-web.js retry internally`,
      );
      // THE LOOP THIS FIXES: whatsapp-web.js's own 30s auth/ready timeout
      // (Client.js's AbortController pattern) never gets a chance to fire
      // here, because each new recovery cycle aborts the previous inject()
      // before its timeout elapses — so if WhatsApp Web keeps bouncing
      // between / and ?post_logout=1 indefinitely, nothing would ever time
      // out on its own and the app would stay in INITIALIZING forever. This
      // cycle count is the explicit, configurable bound that replaces that
      // timeout for this specific failure shape.
      //
      // IMPORTANT: we do NOT call giveUp() here directly. This handler is
      // running synchronously inside whatsapp-web.js's own framenavigated
      // handler (Client.js's `this.emit(Events.DISCONNECTED, 'LOGOUT')`,
      // called partway through its own logout-recovery sequence, which
      // still has an authStrategy.afterBrowserInitialized() await and then
      // a page.evaluate() left to go). Destroying the browser reactively
      // right here would race that in-flight continuation and crash it —
      // exactly the same class of bug the LOGOUT-suppression above fixes
      // (this was verified by testing: doing it here reproduced "Execution
      // context was destroyed" at the same page.evaluate call). Instead we
      // record the decision and let instrumentedLocalAuth's
      // afterBrowserInitialized hook — which that same in-flight sequence
      // is guaranteed to await next — abort it safely from the inside.
      if (recoveryCycles >= config.maxRecoveryCycles) {
        pendingGiveUp =
          `WhatsApp Web did not complete its bootstrap after ${recoveryCycles} logout/recovery cycles ` +
          `(repeatedly navigating between / and ?post_logout=1). This is WhatsApp Web's own bootstrap ` +
          `failing, not a QR/authentication problem — see the WhatsApp Web console errors in the trace log.`;
        trace(`recovery cycle threshold reached, will abort on next afterBrowserInitialized call`);
      }
      return;
    }

    // Real disconnect (browser already gone, or a reason other than the
    // internal LOGOUT-recovery signal) — no in-flight work left to race
    // against, so forwarding is safe. Matches whatsapp-web.js's own
    // destroy() guard (`if (browser?.isConnected()) await browser.close()`).
    // Routed through giveUp() too, so it can't fire twice alongside the
    // browser-disconnected/page-crashed callbacks above.
    giveUp(reasonStr, "disconnected");
  });

  const onUnhandledRejection = (reason: unknown) => {
    const message = recoverableRejectionMessage(reason);
    if (message === undefined) return; // not ours; let Node's default handling apply
    trace(`unhandled rejection from a background whatsapp-web.js operation: ${message}`);
    giveUp(message, "auth-failure"); // safe no-op if already settled/destroyed — see giveUp()
  };
  process.on("unhandledRejection", onUnhandledRejection);

  return {
    // Deliberately NOT retrying here: a same-profile retry after this class
    // of failure was previously reproduced failing identically, so a retry
    // only hid the real signal. Failures are reported, not papered over.
    initialize: () => client.initialize(),
    destroy: () => {
      if (destroyed) return Promise.resolve(); // idempotent: avoid double cleanup
      destroyed = true;
      // Deliberately NOT removing onUnhandledRejection here. Verified by
      // testing: whatsapp-web.js can have more than one framenavigated-
      // triggered recovery chain in flight at the same time (e.g. cycle 1's
      // chain still mid-await when cycle 2's LOGOUT fires) — destroying
      // here only means THIS generation's own work is done, not that every
      // other in-flight chain has finished throwing its
      // GIVE_UP_SENTINEL/lifecycle-error abort (see afterBrowserInitialized
      // above). Removing the listener at this point left later, still-
      // in-flight aborts from those other chains with no listener to catch
      // them, which crashed the process. giveUp()'s own settled/destroyed
      // guard already makes every call through this listener a safe no-op
      // once we're done, so leaving it registered is harmless — the only
      // cost is one extra closure per reconnect for the life of the
      // process, which is negligible for a service that reconnects
      // occasionally rather than continuously.
      return client.destroy();
    },
    logout: () => client.logout(),
  };
}
