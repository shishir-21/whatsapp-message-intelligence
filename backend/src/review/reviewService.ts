import type { FinalResultValues, ReviewResolution, ReviewWithContext } from "../db/reviewRepository";
import { CATEGORY_TO_DB, PRIORITY_TO_DB } from "../ai/schema";
import type { ApproveReviewInput, CorrectReviewInput } from "./reviewSchema";

export class ReviewNotFoundError extends Error {
  constructor() {
    super("Review not found");
    this.name = "ReviewNotFoundError";
  }
}

export class ReviewConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewConflictError";
  }
}

export interface ReviewStore {
  findPending(groupId?: string): Promise<ReviewWithContext[]>;
  findById(id: string): Promise<ReviewWithContext | null>;
  resolveReview(id: string, resolution: ReviewResolution): Promise<boolean>;
}

export class ReviewService {
  constructor(private readonly store: ReviewStore) {}

  listPending(groupId?: string): Promise<ReviewWithContext[]> {
    return this.store.findPending(groupId);
  }

  async get(id: string): Promise<ReviewWithContext> {
    const review = await this.store.findById(id);
    if (!review) throw new ReviewNotFoundError();
    return review;
  }

  // Approving twice is idempotent (returns the existing result); approving a
  // review that was corrected is a conflict.
  async approve(id: string, input: ApproveReviewInput = {}): Promise<ReviewWithContext> {
    const review = await this.get(id);
    if (review.status === "APPROVED") return review;
    if (review.status !== "PENDING") throw new ReviewConflictError(`Review is already ${review.status}`);

    const { aiAnalysis } = review;
    const final: FinalResultValues = {
      category: aiAnalysis.category,
      summary: aiAnalysis.summary,
      priority: aiAnalysis.priority,
      actionRequired: aiAnalysis.actionRequired,
      requestedAction: aiAnalysis.requestedAction,
      people: aiAnalysis.people,
      deadline: aiAnalysis.deadline,
      entities: Array.isArray(aiAnalysis.entities) ? aiAnalysis.entities.map(String) : [],
    };
    return this.resolve(
      review,
      { status: "APPROVED", reviewerName: input.reviewerName, notes: input.notes, final },
    );
  }

  // Corrections are not idempotent: any review that is no longer PENDING is
  // a conflict.
  async correct(id: string, input: CorrectReviewInput): Promise<ReviewWithContext> {
    const review = await this.get(id);
    if (review.status !== "PENDING") throw new ReviewConflictError(`Review is already ${review.status}`);

    const final: FinalResultValues = {
      category: CATEGORY_TO_DB[input.category],
      summary: input.summary,
      priority: PRIORITY_TO_DB[input.priority],
      actionRequired: input.actionRequired,
      requestedAction: input.requestedAction,
      people: input.people,
      deadline: input.deadline,
      entities: input.entities,
    };
    return this.resolve(
      review,
      { status: "CORRECTED", reviewerName: input.reviewerName, notes: input.notes, final },
    );
  }

  private async resolve(review: ReviewWithContext, resolution: ReviewResolution): Promise<ReviewWithContext> {
    const won = await this.store.resolveReview(review.id, resolution);
    const latest = await this.get(review.id);
    if (won) return latest;
    // Lost a race: another request resolved it first. Only a repeated
    // approval is acceptable (idempotent); anything else is a conflict.
    if (resolution.status === "APPROVED" && latest.status === "APPROVED") return latest;
    throw new ReviewConflictError(`Review is already ${latest.status}`);
  }
}
