import type { ReviewWithContext } from "../db/reviewRepository";

// API shape for a review. Deliberately omits AIAnalysis.rawOutput, model and
// promptVersion, which are internal audit data.
export function toReviewView(review: ReviewWithContext) {
  const { aiAnalysis, finalResult } = review;
  const { message } = aiAnalysis;
  return {
    id: review.id,
    status: review.status,
    reason: review.reason,
    reviewerName: review.reviewerName,
    notes: review.notes,
    reviewedAt: review.reviewedAt,
    createdAt: review.createdAt,
    message: {
      id: message.id,
      content: message.content,
      senderName: message.senderName,
      sentAt: message.sentAt,
    },
    aiAnalysis: {
      id: aiAnalysis.id,
      category: aiAnalysis.category,
      confidence: aiAnalysis.confidence,
      summary: aiAnalysis.summary,
      priority: aiAnalysis.priority,
      actionRequired: aiAnalysis.actionRequired,
      requestedAction: aiAnalysis.requestedAction,
      people: aiAnalysis.people,
      deadline: aiAnalysis.deadline,
      entities: aiAnalysis.entities,
    },
    finalResult: finalResult && {
      id: finalResult.id,
      category: finalResult.category,
      summary: finalResult.summary,
      priority: finalResult.priority,
      actionRequired: finalResult.actionRequired,
      requestedAction: finalResult.requestedAction,
      people: finalResult.people,
      deadline: finalResult.deadline,
      entities: finalResult.entities,
    },
  };
}
