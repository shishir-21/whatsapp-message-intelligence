// Mirrors the backend WhatsAppStatus values.
export type WhatsAppStatus =
  | "DISCONNECTED"
  | "INITIALIZING"
  | "QR_REQUIRED"
  | "AUTHENTICATED"
  | "READY"
  | "AUTH_FAILURE";

export interface WhatsAppStatusResponse {
  status: WhatsAppStatus;
  hasError: boolean;
  updatedAt: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
}

export interface SelectedGroup {
  id: string;
  name: string;
}
