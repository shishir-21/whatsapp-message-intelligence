import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { correctReviewSchema } from "./reviewSchema";

const valid = {
  category: "Change Request",
  summary: "Move the deploy to Friday.",
  priority: "medium",
  actionRequired: true,
  requestedAction: "Reschedule deploy",
  people: ["Asha"],
  deadline: "2026-01-02T10:00:00Z",
  entities: ["deploy"],
  reviewerName: "Ravi",
};

describe("correctReviewSchema", () => {
  it("accepts a valid correction and parses the deadline", () => {
    const parsed = correctReviewSchema.parse(valid);
    assert.ok(parsed.deadline instanceof Date);
  });

  it("accepts a null deadline", () => {
    assert.equal(correctReviewSchema.parse({ ...valid, deadline: null }).deadline, null);
  });

  it("rejects an unknown category or priority", () => {
    assert.equal(correctReviewSchema.safeParse({ ...valid, category: "Spam" }).success, false);
    assert.equal(correctReviewSchema.safeParse({ ...valid, priority: "urgent" }).success, false);
  });

  it("rejects a bad deadline, missing fields and unknown keys", () => {
    assert.equal(correctReviewSchema.safeParse({ ...valid, deadline: "tomorrow" }).success, false);
    assert.equal(correctReviewSchema.safeParse({ ...valid, summary: undefined }).success, false);
    assert.equal(correctReviewSchema.safeParse({ ...valid, confidence: 0.5 }).success, false);
  });
});
