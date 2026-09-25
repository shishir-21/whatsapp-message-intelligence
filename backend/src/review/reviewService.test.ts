import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewResolution, ReviewWithContext } from "../db/reviewRepository";
import { correctReviewSchema } from "./reviewSchema";
import { ReviewConflictError, ReviewNotFoundError, ReviewService, type ReviewStore } from "./reviewService";

const aiAnalysis = Object.freeze({
  id: "a1",
  messageId: "m1",
  category: "INCIDENT",
  confidence: 0.6,
  summary: "Server down.",
  priority: "HIGH",
  actionRequired: true,
  requestedAction: "Restart server",
  people: ["Asha"],
  deadline: null,
  entities: ["server"],
  rawOutput: {},
  model: "test",
  promptVersion: "v1",
  createdAt: new Date("2026-01-01T10:00:00Z"),
  message: Object.freeze({ id: "m1", content: "server down" }),
});

interface FinalRecord {
  reviewId: string;
  aiAnalysisId: string;
  category: string;
  summary: string | null;
}

// In-memory stand-in for the repository, with the same compare-and-set rule.
function fakeStore() {
  const review = {
    id: "r1",
    aiAnalysisId: "a1",
    status: "PENDING",
    reason: "Incident",
    reviewerName: null,
    notes: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aiAnalysis,
    finalResult: null,
  } as unknown as ReviewWithContext;
  const finals: FinalRecord[] = [];
  const store: ReviewStore = {
    findPending: async () => (review.status === "PENDING" ? [review] : []),
    findById: async (id) => (id === review.id ? review : null),
    resolveReview: async (id, resolution: ReviewResolution) => {
      if (id !== review.id || review.status !== "PENDING") return false;
      review.status = resolution.status;
      review.reviewedAt = new Date();
      finals.push({
        reviewId: id,
        aiAnalysisId: review.aiAnalysisId,
        category: resolution.final.category,
        summary: resolution.final.summary,
      });
      return true;
    },
  };
  return { store, finals, review };
}

const correction = correctReviewSchema.parse({
  category: "Routine Update",
  summary: "Server was restarted; all fine.",
  priority: "low",
  actionRequired: false,
  requestedAction: null,
  people: [],
  deadline: null,
  entities: ["server"],
  reviewerName: "Ravi",
});

describe("ReviewService", () => {
  it("approval creates a FinalResult copied from the AI analysis", async () => {
    const { store, finals } = fakeStore();
    const result = await new ReviewService(store).approve("r1", { reviewerName: "Ravi" });
    assert.equal(result.status, "APPROVED");
    assert.deepEqual(finals, [{ reviewId: "r1", aiAnalysisId: "a1", category: "INCIDENT", summary: "Server down." }]);
  });

  it("correction creates a FinalResult from the human values", async () => {
    const { store, finals } = fakeStore();
    const result = await new ReviewService(store).correct("r1", correction);
    assert.equal(result.status, "CORRECTED");
    assert.deepEqual(finals, [
      { reviewId: "r1", aiAnalysisId: "a1", category: "ROUTINE_UPDATE", summary: "Server was restarted; all fine." },
    ]);
  });

  it("leaves the original AIAnalysis unchanged", async () => {
    const { store, review } = fakeStore();
    const before = structuredClone(aiAnalysis);
    await new ReviewService(store).correct("r1", correction);
    assert.deepEqual(review.aiAnalysis, before);
  });

  it("handles duplicate approval without a second FinalResult", async () => {
    const { store, finals } = fakeStore();
    const service = new ReviewService(store);
    await service.approve("r1");
    const again = await service.approve("r1");
    assert.equal(again.status, "APPROVED");
    assert.equal(finals.length, 1);
  });

  it("rejects modifying an already completed review", async () => {
    const approved = fakeStore();
    await new ReviewService(approved.store).approve("r1");
    await assert.rejects(new ReviewService(approved.store).correct("r1", correction), ReviewConflictError);

    const corrected = fakeStore();
    await new ReviewService(corrected.store).correct("r1", correction);
    await assert.rejects(new ReviewService(corrected.store).approve("r1"), ReviewConflictError);
    await assert.rejects(new ReviewService(corrected.store).correct("r1", correction), ReviewConflictError);
    assert.equal(corrected.finals.length, 1);
  });

  it("rejects a concurrent approve/correct that loses the race", async () => {
    const { store, finals } = fakeStore();
    // Simulate another request winning between our read and our write.
    const racing: ReviewStore = {
      ...store,
      resolveReview: async (id, resolution) => {
        await store.resolveReview(id, { ...resolution, status: "APPROVED" });
        return store.resolveReview(id, resolution);
      },
    };
    await assert.rejects(new ReviewService(racing).correct("r1", correction), ReviewConflictError);
    assert.equal(finals.length, 1);
  });

  it("throws not-found for an unknown review", async () => {
    await assert.rejects(new ReviewService(fakeStore().store).approve("nope"), ReviewNotFoundError);
  });
});
