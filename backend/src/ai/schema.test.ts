import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIResponseError, parseAIAnalysis } from "./schema";

const valid = {
  category: "Change Request",
  confidence: 0.9,
  summary: "Move meeting to 6 PM.",
  priority: "medium",
  actionRequired: true,
  requestedAction: "Reschedule the meeting",
  people: ["Asha"],
  deadline: null,
  entities: ["meeting"],
};

const parse = (value: unknown) => parseAIAnalysis(JSON.stringify(value));

describe("parseAIAnalysis", () => {
  it("accepts a valid result", () => {
    assert.deepEqual(parse(valid), valid);
  });

  it("rejects an invalid category", () => {
    assert.throws(() => parse({ ...valid, category: "Gossip" }), AIResponseError);
  });

  it("rejects confidence outside 0-1", () => {
    assert.throws(() => parse({ ...valid, confidence: 1.5 }), AIResponseError);
    assert.throws(() => parse({ ...valid, confidence: -0.1 }), AIResponseError);
  });

  it("rejects missing fields", () => {
    const { summary: _summary, ...rest } = valid;
    assert.throws(() => parse(rest), AIResponseError);
  });

  it("fails safely on malformed or non-JSON output", () => {
    assert.throws(() => parseAIAnalysis("Sure! Here is the JSON: {}"), AIResponseError);
    assert.throws(() => parseAIAnalysis('{"category": '), AIResponseError);
    assert.throws(() => parseAIAnalysis("null"), AIResponseError);
  });
});
