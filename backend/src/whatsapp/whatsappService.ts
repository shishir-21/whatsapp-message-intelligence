import { EventEmitter } from "node:events";
import {
  WhatsAppStatus,
  type WhatsAppClientFactory,
  type WhatsAppClientHandle,
  type WhatsAppState,
} from "./types";

const log = (message: string) => console.log(`[whatsapp] ${message}`);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Owns the single WhatsApp client and turns its events into simple state.
// Emits "status" (WhatsAppState) on every change and "qr" (string) when a new
// QR is available.
export class WhatsAppService extends EventEmitter {
  private client: WhatsAppClientHandle | null = null;
  // Bumped whenever a client is created or discarded, so late events from a
  // discarded client can't overwrite the current state.
  private generation = 0;
  private qr: string | null = null;
  private state: WhatsAppState = {
    status: WhatsAppStatus.DISCONNECTED,
    lastError: null,
    updatedAt: new Date(),
  };

  constructor(private readonly createClient: WhatsAppClientFactory) {
    super();
  }

  getStatus(): WhatsAppState {
    return { ...this.state };
  }

  getQrCode(): string | null {
    return this.state.status === WhatsAppStatus.QR_REQUIRED ? this.qr : null;
  }

  // Safe to call repeatedly: a second call while a client exists is a no-op.
  // Never rejects; failures are reflected in the state instead.
  async initialize(): Promise<void> {
    if (this.client) return;

    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation;

    this.setState(WhatsAppStatus.INITIALIZING, null);
    log("Initializing client");

    const client = this.createClient({
      onQr: (qr) => {
        if (!isCurrent()) return;
        this.qr = qr;
        this.setState(WhatsAppStatus.QR_REQUIRED, null);
        log("QR code available - scan it to link this device");
        this.emit("qr", qr);
      },
      onAuthenticated: () => {
        if (!isCurrent()) return;
        this.qr = null;
        this.setState(WhatsAppStatus.AUTHENTICATED, null);
        log("Authenticated");
      },
      onAuthFailure: (message) => {
        if (!isCurrent()) return;
        this.qr = null;
        this.setState(WhatsAppStatus.AUTH_FAILURE, message);
        log(`Authentication failed: ${message}`);
        void this.discardClient();
      },
      onReady: () => {
        if (!isCurrent()) return;
        this.qr = null;
        this.setState(WhatsAppStatus.READY, null);
        log("Client ready");
      },
      onDisconnected: (reason) => {
        if (!isCurrent()) return;
        this.qr = null;
        this.setState(WhatsAppStatus.DISCONNECTED, `Disconnected: ${reason}`);
        log(`Disconnected (${reason})`);
        void this.discardClient();
      },
    });
    this.client = client;

    try {
      await client.initialize();
    } catch (err) {
      if (!isCurrent()) return;
      this.qr = null;
      this.setState(WhatsAppStatus.DISCONNECTED, `Initialization failed: ${errorMessage(err)}`);
      log(`Initialization failed: ${errorMessage(err)}`);
      await this.discardClient();
    }
  }

  // Unlinks the device and deletes the local session; a new QR scan is
  // needed next time.
  async logout(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      await client.logout();
    } catch (err) {
      log(`Logout failed: ${errorMessage(err)}`);
    }
    await this.discardClient();
    this.qr = null;
    this.setState(WhatsAppStatus.DISCONNECTED, null);
  }

  // Closes the browser but keeps the local session, so the next start
  // reconnects without a QR. Used on process shutdown.
  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.discardClient();
    this.qr = null;
    this.setState(WhatsAppStatus.DISCONNECTED, null);
  }

  private async discardClient(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.client = null;
    this.generation++;
    try {
      await client.destroy();
    } catch (err) {
      log(`Error while destroying client: ${errorMessage(err)}`);
    }
  }

  private setState(status: WhatsAppStatus, lastError: string | null): void {
    this.state = { status, lastError, updatedAt: new Date() };
    this.emit("status", this.getStatus());
  }
}
