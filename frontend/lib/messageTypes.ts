// Shapes returned by GET /api/messages (see backend/src/messages/messageHistoryService.ts).
import type { CategoryCode, PriorityCode } from "./reviewTypes";

export type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export const STATUS_FILTERS = ["ALL", "PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

// Fields shared by the AI analysis and the final result.
export interface ResultFields {
  category: CategoryCode;
  summary: string | null;
  priority: PriorityCode | null;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: string | null;
  // Stored as JSON on the backend; normalised with toStringList before use.
  entities: unknown;
}

export interface HistoryAnalysis extends ResultFields {
  id: string;
  confidence: number;
  createdAt: string;
}

export interface HistoryReview {
  id: string;
  status: "PENDING" | "APPROVED" | "CORRECTED";
  reason: string;
  reviewedAt: string | null;
}

export interface HistoryFinalResult extends ResultFields {
  id: string;
  finalizedAt: string;
}

export interface HistoryMessage {
  id: string;
  whatsappMessageId: string;
  senderId: string;
  senderName: string | null;
  messageType: string;
  content: string;
  sentAt: string;
  createdAt: string;
  processingStatus: ProcessingStatus;
  processingAttempts: number;
  aiAnalysis: HistoryAnalysis | null;
  review: HistoryReview | null;
  finalResult: HistoryFinalResult | null;
}

export interface MessagesResponse {
  messages: HistoryMessage[];
}
