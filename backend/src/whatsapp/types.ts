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
}

// The subset of the WPPConnect client that createWhatsAppClient exposes.
export interface WhatsAppClientHandle {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  logout(): Promise<void>;
}

export type WhatsAppClientFactory = (handlers: WhatsAppEventHandlers) => WhatsAppClientHandle;
