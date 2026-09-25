import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AIProvider } from "../ai/types";
import type { NewAIAnalysis } from "../db/aiAnalysisRepository";
import type { MessageWithGroup } from "../db/messageRepository";
import type { ReviewDecision } from "../review/reviewDecision";
import { MessageProcessingService, type ProcessingStore } from "./messageProcessingService";

const THRESHOLD = 0.8;

const message = (content: string): MessageWithGroup => ({
  id: "m1",
  whatsappMessageId: "w1",
  groupId: "g1",
  senderId: "s1",
  senderName: "Asha",
  content,
  messageType: "TEXT",
  sentAt: new Date("2026-01-01T10:00:00Z"),
  processingStatus: "PROCESSING",
  processingAttempts: 1,
  lastProcessingError: null,
  lastAttemptAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  group: { name: "Ops" },
});

function fakeStore(msg: MessageWithGroup | null, claim = true) {
  const saved: NewAIAnalysis[] = [];
  const decisions: ReviewDecision[] = [];
  const failures: string[] = [];
  const store: ProcessingStore = {
    findForProcessing: async () => msg,
    claimForProcessing: async () => claim,
    claimForRetry: async () => claim,
    saveAnalysisAndComplete: async (analysis, decision) => {
      saved.push(analysis);
      decisions.push(decision);
    },
    markProcessingFailed: async (_id, error) => void failures.push(error),
  };
  return { store, saved, decisions, failures };
}

const goodOutput = JSON.stringify({
  category: "Question",
  confidence: 0.8,
  summary: "Asks about a meeting.",
  priority: "low",
  actionRequired: false,
  requestedAction: null,
  people: [],
  deadline: "2026-01-02T10:00:00Z",
  entities: [],
});

const providerReturning = (content: string): AIProvider => ({
  analyze: async () => ({ model: "test-model", content }),
});

describe("MessageProcessingService", () => {
  it("saves a validated analysis on success", async () => {
    const { store, saved, failures } = fakeStore(message("Can we meet tomorrow?"));
    await new MessageProcessingService(providerReturning(goodOutput), store, THRESHOLD).process("m1");
    assert.equal(failures.length, 0);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].category, "QUESTION");
    assert.equal(saved[0].model, "test-model");
    assert.ok(saved[0].deadline instanceof Date);
  });

  it("passes a no-review decision for a confident, routine result", async () => {
    const { store, decisions } = fakeStore(message("Can we meet tomorrow?"));
    await new MessageProcessingService(providerReturning(goodOutput), store, THRESHOLD).process("m1");
    assert.deepEqual(decisions, [{ requiresReview: false }]);
  });

  it("passes a review decision for an incident and still saves the analysis", async () => {
    const { store, saved, decisions, failures } = fakeStore(message("Server is down"));
    const incident = JSON.stringify({ ...JSON.parse(goodOutput), category: "Incident" });
    await new MessageProcessingService(providerReturning(incident), store, THRESHOLD).process("m1");
    assert.equal(failures.length, 0);
    assert.equal(saved.length, 1);
    assert.equal(decisions[0].requiresReview, true);
  });

  it("marks the message FAILED when the provider throws", async () => {
    const { store, saved, failures } = fakeStore(message("hello"));
    const provider: AIProvider = {
      analyze: async () => {
        throw new Error("Groq down");
      },
    };
    await new MessageProcessingService(provider, store, THRESHOLD).process("m1");
    assert.equal(saved.length, 0);
    assert.deepEqual(failures, ["Groq down"]);
  });

  it("marks FAILED and creates no analysis on malformed output", async () => {
    const { store, saved, failures } = fakeStore(message("hello"));
    await new MessageProcessingService(providerReturning("not json"), store, THRESHOLD).process("m1");
    assert.equal(saved.length, 0);
    assert.equal(failures.length, 1);
  });

  it("marks FAILED without calling the provider when there is no text", async () => {
    const { store, saved, failures } = fakeStore(message("   "));
    let called = false;
    const provider: AIProvider = {
      analyze: async () => {
        called = true;
        return { model: "m", content: goodOutput };
      },
    };
    await new MessageProcessingService(provider, store, THRESHOLD).process("m1");
    assert.equal(called, false);
    assert.equal(saved.length, 0);
    assert.equal(failures.length, 1);
  });

  it("does nothing when the message was already claimed", async () => {
    const { store, saved, failures } = fakeStore(message("hi"), false);
    await new MessageProcessingService(providerReturning(goodOutput), store, THRESHOLD).process("m1");
    assert.equal(saved.length + failures.length, 0);
  });
});
