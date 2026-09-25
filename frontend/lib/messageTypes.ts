// Shapes returned by GET /api/messages (see backend/src/messages/messageHistoryService.ts).
import type { CategoryCode, PriorityCode } from "./reviewTypes";

export type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export const STATUSES = ["PENDING", "COMPLETED", "PROCESSING", "FAILED"] as const satisfies readonly ProcessingStatus[];

export const STATUS_LABELS: Record<ProcessingStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  PROCESSING: "Processing",
  FAILED: "Failed",
};

// Secondary filter; "ALL" means no category filter.
export const CATEGORY_FILTERS = [
  "ALL",
  "ROUTINE_UPDATE",
  "INCIDENT",
  "CHANGE_REQUEST",
  "RESOURCE_UPDATE",
  "QUESTION",
  "IRRELEVANT",
] as const satisfies readonly ("ALL" | CategoryCode)[];
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  ALL: "All",
  ROUTINE_UPDATE: "Routine Update",
  INCIDENT: "Incident",
  CHANGE_REQUEST: "Change Request",
  RESOURCE_UPDATE: "Resource Update",
  QUESTION: "Question",
  IRRELEVANT: "Irrelevant",
};

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
