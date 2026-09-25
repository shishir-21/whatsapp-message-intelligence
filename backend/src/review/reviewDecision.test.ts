import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReviewConfigError, loadReviewConfig } from "./reviewConfig";
import { decideReview } from "./reviewDecision";

const T = 0.8;

describe("decideReview", () => {
  it("requires review when confidence is below the threshold", () => {
    const d = decideReview({ category: "QUESTION", confidence: 0.79, priority: "LOW" }, T);
    assert.equal(d.requiresReview, true);
  });

  it("requires review for high priority", () => {
    const d = decideReview({ category: "QUESTION", confidence: 0.99, priority: "HIGH" }, T);
    assert.equal(d.requiresReview, true);
  });

  it("requires review for incidents", () => {
    const d = decideReview({ category: "INCIDENT", confidence: 0.99, priority: "LOW" }, T);
    assert.equal(d.requiresReview, true);
  });

  it("does not require review for a confident, non-incident, non-high result", () => {
    assert.deepEqual(decideReview({ category: "QUESTION", confidence: 0.8, priority: "MEDIUM" }, T), {
      requiresReview: false,
    });
  });

  it("lists every applicable reason", () => {
    const d = decideReview({ category: "INCIDENT", confidence: 0.1, priority: "HIGH" }, T);
    assert.ok(d.requiresReview && d.reason.includes("Low confidence") && d.reason.includes("High priority") && d.reason.includes("Incident"));
  });
});

describe("loadReviewConfig", () => {
  it("reads a valid threshold", () => {
    assert.equal(loadReviewConfig({ AI_REVIEW_CONFIDENCE_THRESHOLD: "0.80" }).confidenceThreshold, 0.8);
  });

  it("rejects a missing, non-numeric or out-of-range value", () => {
    for (const value of [undefined, "", "abc", "1.5", "-0.1"]) {
      assert.throws(() => loadReviewConfig({ AI_REVIEW_CONFIDENCE_THRESHOLD: value }), ReviewConfigError);
    }
  });
});
