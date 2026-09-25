import type { AIAnalysis, MessageCategory, Priority } from "@prisma/client";
import type { ReviewDecision } from "../review/reviewDecision";
import { prisma } from "./prisma";

export interface NewAIAnalysis {
  messageId: string;
  category: MessageCategory;
  confidence: number;
  summary: string;
  priority: Priority;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: Date | null;
  entities: string[];
  rawOutput: object;
  model: string;
  promptVersion: string;
}

// Inserts a new analysis, marks the message COMPLETED, and records the review
// outcome in one transaction: a PENDING Review when a human must look, or an
// immediate FinalResult copied from the analysis when not. A message is never
// COMPLETED without its analysis and outcome. The analysis is never updated.
export function saveAnalysisAndComplete(
  analysis: NewAIAnalysis,
  decision: ReviewDecision,
): Promise<AIAnalysis> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.aIAnalysis.create({ data: analysis });
    await tx.message.update({
      where: { id: analysis.messageId },
      data: { processingStatus: "COMPLETED", lastProcessingError: null },
    });
    if (decision.requiresReview) {
      await tx.review.create({
        data: { aiAnalysisId: created.id, status: "PENDING", reason: decision.reason },
      });
    } else {
      await tx.finalResult.create({
        data: {
          messageId: analysis.messageId,
          aiAnalysisId: created.id,
          category: analysis.category,
          summary: analysis.summary,
          priority: analysis.priority,
          actionRequired: analysis.actionRequired,
          requestedAction: analysis.requestedAction,
          people: analysis.people,
          deadline: analysis.deadline,
          entities: analysis.entities,
        },
      });
    }
    return created;
  });
}
