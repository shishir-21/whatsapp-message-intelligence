import { z } from "zod";
import type { MessageCategory } from "@prisma/client";
import type { MessageWithHistory } from "../db/messageRepository";
import { CATEGORY_TO_DB } from "../ai/schema";

export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 100;

export const historyQuerySchema = z.object({
  status: z.enum(["ALL", "PENDING", "PROCESSING", "COMPLETED", "FAILED"]).default("ALL"),
  // Optional; matches the message's resolved category (final result first,
  // otherwise the latest AI analysis).
  category: z.enum(Object.values(CATEGORY_TO_DB) as [MessageCategory, ...MessageCategory[]]).optional(),
  // Group.id of the group whose messages to show (the selected group).
  groupId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_LIMIT).default(DEFAULT_HISTORY_LIMIT),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export interface MessageHistoryStore {
  findHistory(query: {
    status?: Exclude<HistoryQuery["status"], "ALL">;
    // Resolved category: FinalResult.category if present, otherwise the
    // latest AIAnalysis.category.
    category?: MessageCategory;
    groupId?: string;
    limit: number;
  }): Promise<MessageWithHistory[]>;
}

export class MessageHistoryService {
  constructor(private readonly store: MessageHistoryStore) {}

  async list(query: HistoryQuery): Promise<MessageHistoryView[]> {
    const status = query.status === "ALL" ? undefined : query.status;
    const messages = await this.store.findHistory({
      status,
      category: query.category,
      ...(query.groupId ? { groupId: query.groupId } : {}),
      limit: query.limit,
    });
    return messages.map(toMessageHistoryView);
  }
}

// API shape for the history list. Omits AIAnalysis.rawOutput/model/
// promptVersion and Message.lastProcessingError (internal audit data).
export function toMessageHistoryView(message: MessageWithHistory) {
  // The query already returns only the newest analysis; picking by createdAt
  // here keeps the view correct even if more rows are ever included.
  const ai =
    message.analyses.reduce<(typeof message.analyses)[number] | null>(
      (latest, a) => (!latest || a.createdAt > latest.createdAt ? a : latest),
      null,
    );
  const review = ai?.review ?? null;
  const final = message.finalResult;
  return {
    id: message.id,
    whatsappMessageId: message.whatsappMessageId,
    senderId: message.senderId,
    senderName: message.senderName,
    messageType: message.messageType,
    content: message.content,
    sentAt: message.sentAt,
    createdAt: message.createdAt,
    processingStatus: message.processingStatus,
    processingAttempts: message.processingAttempts,
    aiAnalysis: ai && {
      id: ai.id,
      category: ai.category,
      confidence: ai.confidence,
      summary: ai.summary,
      priority: ai.priority,
      actionRequired: ai.actionRequired,
      requestedAction: ai.requestedAction,
      people: ai.people,
      deadline: ai.deadline,
      entities: ai.entities,
      createdAt: ai.createdAt,
    },
    review: review && {
      id: review.id,
      status: review.status,
      reason: review.reason,
      reviewedAt: review.reviewedAt,
    },
    finalResult: final && {
      id: final.id,
      category: final.category,
      summary: final.summary,
      priority: final.priority,
      actionRequired: final.actionRequired,
      requestedAction: final.requestedAction,
      people: final.people,
      deadline: final.deadline,
      entities: final.entities,
      finalizedAt: final.createdAt,
    },
  };
}

export type MessageHistoryView = ReturnType<typeof toMessageHistoryView>;
