import type { IncomingMessage } from "../messages/types";

export const WhatsAppStatus = {
  DISCONNECTED: "DISCONNECTED",
  INITIALIZING: "INITIALIZING",
  QR_REQUIRED: "QR_REQUIRED",
  AUTHENTICATED: "AUTHENTICATED",
  READY: "READY",
  AUTH_FAILURE: "AUTH_FAILURE",
} as const;

export type WhatsAppStatus = (typeof WhatsAppStatus)[keyof typeof WhatsAppStatus];

export interface WhatsAppState {
  status: WhatsAppStatus;
  lastError: string | null;
  updatedAt: Date;
}

// Application-level callbacks. WPPConnect's status names stay inside
// whatsappClient.ts; whatever owns the client only sees these.
export interface WhatsAppEventHandlers {
  onQr(qr: string): void;
  onAuthenticated(): void;
  onAuthFailure(message: string): void;
  onReady(): void;
  onDisconnected(reason: string): void;
  // A normalized message from a group chat, sent by someone else.
  onMessage(message: IncomingMessage): void;
}

// The only group information the rest of the application sees.
export interface WhatsAppGroup {
  id: string;
  name: string;
}

// The subset of the WPPConnect client that createWhatsAppClient exposes.
export interface WhatsAppClientHandle {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  logout(): Promise<void>;
  listGroups(): Promise<WhatsAppGroup[]>;
}

export type WhatsAppClientFactory = (handlers: WhatsAppEventHandlers) => WhatsAppClientHandle;
