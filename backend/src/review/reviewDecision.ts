import type { MessageCategory, Priority } from "@prisma/client";

export type ReviewDecision = { requiresReview: false } | { requiresReview: true; reason: string };

export interface ReviewCandidate {
  category: MessageCategory;
  confidence: number;
  priority: Priority | null;
}

// A message needs a human when the AI is unsure, or when the message is
// important enough that a mistake is costly.
export function decideReview(candidate: ReviewCandidate, confidenceThreshold: number): ReviewDecision {
  const reasons: string[] = [];
  if (candidate.confidence < confidenceThreshold) {
    reasons.push(`Low confidence (${candidate.confidence} < ${confidenceThreshold})`);
  }
  if (candidate.priority === "HIGH") reasons.push("High priority");
  if (candidate.category === "INCIDENT") reasons.push("Incident");
  return reasons.length > 0 ? { requiresReview: true, reason: reasons.join("; ") } : { requiresReview: false };
}
