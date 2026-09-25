export class ReviewConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewConfigError";
  }
}

export interface ReviewConfig {
  confidenceThreshold: number;
}

// Fails loudly rather than falling back to a default: the threshold decides
// which messages a human sees, so a silent guess would be a hidden behavior.
export function loadReviewConfig(env: NodeJS.ProcessEnv = process.env): ReviewConfig {
  const raw = env.AI_REVIEW_CONFIDENCE_THRESHOLD?.trim();
  if (!raw) {
    throw new ReviewConfigError("AI_REVIEW_CONFIDENCE_THRESHOLD is not set");
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ReviewConfigError(
      `AI_REVIEW_CONFIDENCE_THRESHOLD must be a number between 0 and 1, got "${raw}"`,
    );
  }
  return { confidenceThreshold: value };
}
