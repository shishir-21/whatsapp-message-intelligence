import fs from "node:fs";
import path from "node:path";
import { create, type Message, type Whatsapp } from "@wppconnect-team/wppconnect";
import { puppeteerConfig } from "@wppconnect-team/wppconnect/dist/config/puppeteer.config";
import puppeteer, { type Browser } from "puppeteer";
import type { IncomingMessage } from "../messages/types";
import type { WhatsAppClientHandle, WhatsAppEventHandlers, WhatsAppGroup } from "./types";

export interface WhatsAppClientConfig {
  // WPPConnect session name.
  clientId: string;
  // Directory WPPConnect stores its session tokens in.
  sessionPath: string;
  headless: boolean;
}

export function loadWhatsAppClientConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppClientConfig {
  return {
    clientId: env.WHATSAPP_CLIENT_ID || "whatsapp-message-intelligence",
    sessionPath: env.WHATSAPP_SESSION_PATH || "./tokens",
    headless: env.WHATSAPP_HEADLESS !== "false",
  };
}

// We launch Chromium ourselves and hand it to WPPConnect (create({ browser })).
// WPPConnect's own launcher always enables puppeteer-extra-plugin-stealth, whose
// user-agent-override evasion breaks the current WhatsApp Web build: the page
// loads but WPP.isReady never becomes true, so wapi.js injection times out after
// 30s. Owning the browser also gives us a handle to close it when create()
// rejects, which WPPConnect does not do itself.
async function launchBrowser(config: WhatsAppClientConfig): Promise<Browser> {
  // Same profile directory WPPConnect would use, so existing sessions carry over.
  const userDataDir = path.resolve(process.cwd(), config.sessionPath, config.clientId);
  fs.mkdirSync(userDataDir, { recursive: true });
  return puppeteer.launch({
    headless: config.headless,
    userDataDir,
    args: [...puppeteerConfig.chromiumArgs],
  });
}

const log = (message: string) => console.log(`[whatsapp:wpp] ${message}`);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function serializeId(id: unknown): string | undefined {
  if (typeof id === "string") return id || undefined;
  const serialized = (id as { _serialized?: unknown } | null | undefined)?._serialized;
  return typeof serialized === "string" && serialized ? serialized : undefined;
}

// WPPConnect 2.3.3 builds the message id as `msg.id._serialized`, which the
// current WhatsApp Web build no longer defines, so raw.id arrives undefined.
// The canonical id is msg.id.toString() (the "false_<chat>_<id>[_<author>]"
// form _serialized used to return). Wrap WPPConnect's in-page serializer to
// fill it in when missing. Idempotent; when raw.id is already present the
// wrapper leaves it untouched.
async function restoreMessageIds(client: Whatsapp): Promise<void> {
  try {
    await client.page.evaluate(`(() => {
      const w = window.WAPI;
      if (!w || w._messageIdPatched) return;
      const original = w._serializeMessageObj;
      w._serializeMessageObj = (msg) => {
        const out = original(msg);
        if (out && !out.id && msg && msg.id) out.id = msg.id.toString();
        return out;
      };
      w._messageIdPatched = true;
    })()`);
  } catch (err) {
    log(`failed to patch message id serialization: ${errorMessage(err)}`);
  }
}

// Maps a raw WPPConnect message to IncomingMessage. Returns null for
// messages that should be ignored: not from a group, sent by this account,
// or missing the identifiers we need.
function normalizeMessage(raw: Message): IncomingMessage | null {
  if (!raw.isGroupMsg || raw.fromMe) return null;

  const whatsappMessageId = serializeId(raw.id);
  const whatsappGroupId = serializeId(raw.chatId) ?? serializeId(raw.from);
  // In group chats "author" is the sending participant; "from" is the group.
  const senderId = serializeId(raw.author) ?? serializeId(raw.sender?.id);
  if (!whatsappMessageId || !whatsappGroupId || !senderId) return null;

  const type = String(raw.type);
  const messageType = type === "chat" ? "text" : type === "image" ? "image" : "other";
  // Images carry their caption in `caption`; `body` is the media payload.
  const text = messageType === "text" ? raw.body : messageType === "image" ? raw.caption : undefined;
  const seconds = raw.t ?? raw.timestamp;

  return {
    whatsappMessageId,
    whatsappGroupId,
    senderId,
    senderName: raw.notifyName || raw.sender?.pushname || raw.sender?.name || undefined,
    timestamp: typeof seconds === "number" ? new Date(seconds * 1000) : new Date(),
    messageType,
    text: text || undefined,
  };
}

// Builds a WPPConnect client and translates its lifecycle callbacks into the
// application-level handlers.
//
// Note on the WPPConnect lifecycle: create() does not resolve when the
// browser starts, it resolves once the account is logged in. While the QR is
// waiting to be scanned it stays pending, and the Whatsapp object needed to
// close the browser only exists after it resolves. Everything before that is
// reported through the statusFind/catchQR callbacks below.
export function createWhatsAppClient(
  config: WhatsAppClientConfig,
  handlers: WhatsAppEventHandlers,
): WhatsAppClientHandle {
  let wpp: Whatsapp | undefined;
  let browser: Browser | undefined;
  let destroyed = false;
  // Each of these is reported to the handlers at most once.
  let authenticated = false;
  let ready = false;
  let ended = false;

  const markAuthenticated = () => {
    if (destroyed || ended || authenticated) return;
    authenticated = true;
    handlers.onAuthenticated();
  };

  const markReady = () => {
    if (destroyed || ended || ready) return;
    markAuthenticated();
    ready = true;
    handlers.onReady();
  };

  // Reports a terminal failure/disconnect exactly once. Callbacks that fire
  // because of our own destroy() are ignored (destroyed is set first).
  const end = (kind: "auth-failure" | "disconnected", reason: string) => {
    if (destroyed || ended) return;
    ended = true;
    log(`${kind}: ${reason}`);
    if (kind === "auth-failure") handlers.onAuthFailure(reason);
    else handlers.onDisconnected(reason);
  };

  const closeBrowser = async () => {
    const b = browser;
    browser = undefined;
    if (!b) return;
    try {
      await b.close();
    } catch (err) {
      log(`error while closing browser: ${errorMessage(err)}`);
    }
  };

  return {
    async initialize() {
      try {
        browser = await launchBrowser(config);
        if (destroyed) {
          await closeBrowser();
          return;
        }
        const client = await create({
          session: config.clientId,
          // Persistent session storage, separate from the POC's tokens-poc.
          folderNameToken: config.sessionPath,
          // Our own Puppeteer browser (see launchBrowser).
          browser,
          useChrome: false,
          headless: config.headless,
          // Keep the session open while waiting for a QR scan; the default
          // closes the browser after 60 seconds.
          autoClose: 0,
          // The QR is delivered through catchQR and kept in memory by the
          // service; don't let WPPConnect print it as well.
          logQR: false,
          catchQR: (_base64Qr, _asciiQR, attempt, urlCode) => {
            if (destroyed || ended) return;
            // urlCode is the raw QR payload, the same kind of string the
            // service stores and the terminal/frontend renders.
            if (!urlCode) {
              log(`QR attempt ${attempt} had no payload, ignoring`);
              return;
            }
            log(`QR generated (attempt ${attempt})`);
            handlers.onQr(urlCode);
          },
          statusFind: (status) => {
            log(`status: ${status}`);
            switch (status) {
              case "isLogged": // an existing session was restored
              case "qrReadSuccess": // the QR was scanned
                markAuthenticated();
                break;
              case "inChat":
                // WPPConnect also emits inChat during startup of a fresh,
                // not-yet-linked session, before the QR exists. Only trust it
                // once the account is actually logged in.
                if (authenticated) markReady();
                break;
              case "disconnectedMobile":
                // Same startup quirk: a fresh session reports "Session
                // Unpaired" (disconnectedMobile) before the QR is shown.
                // Treating that as terminal made us drop the QR. It only
                // means a real disconnect once we were logged in.
                if (authenticated) end("disconnected", status);
                break;
              case "qrReadError":
              case "qrReadFail":
                end("auth-failure", `WhatsApp login failed (${status})`);
                break;
              case "browserClose":
              case "serverClose":
              case "autocloseCalled":
                end("disconnected", status);
                break;
              default:
                break; // notLogged etc.: the QR arrives through catchQR
            }
          },
          onLoadingScreen: (percent, message) => {
            log(`loading: ${percent}% ${message}`);
          },
        });

        if (destroyed) {
          // destroy() ran while create() was still pending; nobody else
          // holds this client, so close it here.
          await client.close().catch(() => undefined);
          return;
        }
        wpp = client;
        await restoreMessageIds(client);
        client.onMessage((raw) => {
          if (destroyed || ended) return;
          try {
            const message = normalizeMessage(raw);
            if (message) handlers.onMessage(message);
          } catch (err) {
            log(`failed to process incoming message: ${errorMessage(err)}`);
          }
        });
        // create() only resolves once logged in.
        markReady();
      } catch (err) {
        // create() leaves the browser running when it rejects; close it so a
        // failed start doesn't leak Chromium or keep the profile locked.
        await closeBrowser();
        // A rejection caused by our own destroy() is expected, not a failure.
        if (destroyed) return;
        throw err;
      }
    },

    // Closes the browser and keeps the saved session, so the next start
    // reconnects without a QR. Idempotent.
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      const client = wpp;
      wpp = undefined;
      if (client) {
        try {
          await client.close();
        } catch (err) {
          log(`error while closing: ${errorMessage(err)}`);
        }
      }
      // Also covers destroy() while create() is still pending (no client yet).
      await closeBrowser();
    },

    // Unlinks this device from the account; a new QR scan is needed next
    // time. The caller follows up with destroy() to close the browser.
    async logout() {
      if (!wpp) return;
      await wpp.logout();
    },

    // Fetches the account's groups live from WhatsApp Web.
    async listGroups(): Promise<WhatsAppGroup[]> {
      if (!wpp) throw new Error("WhatsApp client is not connected");
      const chats = await wpp.listChats({ onlyGroups: true });
      return chats.map((chat) => {
        const id = chat.id._serialized;
        return { id, name: chat.name || id };
      });
    },
  };
}
