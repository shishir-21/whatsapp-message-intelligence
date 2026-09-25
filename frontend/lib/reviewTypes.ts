// Shapes returned by the backend review API (see backend/src/review/reviewView.ts).
// Enum values arrive in their database form (e.g. "INCIDENT", "HIGH").

export type CategoryCode =
  | "ROUTINE_UPDATE"
  | "INCIDENT"
  | "CHANGE_REQUEST"
  | "RESOURCE_UPDATE"
  | "QUESTION"
  | "IRRELEVANT";

export type PriorityCode = "LOW" | "MEDIUM" | "HIGH";

export interface Message {
  id: string;
  content: string;
  senderName: string | null;
  sentAt: string;
}

export interface AIAnalysis {
  id: string;
  category: CategoryCode;
  confidence: number;
  summary: string | null;
  priority: PriorityCode | null;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: string | null;
  // Stored as JSON on the backend; normalised with toStringList before use.
  entities: unknown;
}

export interface FinalResult {
  id: string;
  category: CategoryCode;
  summary: string | null;
  priority: PriorityCode | null;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: string | null;
  entities: unknown;
}

export interface Review {
  id: string;
  status: "PENDING" | "APPROVED" | "CORRECTED";
  reason: string;
  reviewerName: string | null;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  message: Message;
  aiAnalysis: AIAnalysis;
  finalResult: FinalResult | null;
}

export interface ReviewsResponse {
  reviews: Review[];
}

export interface ReviewResponse {
  review: Review;
}

// Payload accepted by POST /api/reviews/:id/correct. No confidence field.
export interface CorrectionPayload {
  category: string;
  summary: string;
  priority: "low" | "medium" | "high";
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: string | null;
  entities: string[];
  reviewerName?: string;
  notes?: string;
}
