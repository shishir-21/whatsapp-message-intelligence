import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import express from "express";
import type { MessageWithHistory } from "../db/messageRepository";
import { createMessageRouter } from "../routes/messageRoutes";
import { MessageHistoryService, type MessageHistoryStore } from "./messageHistoryService";
import type { MessageProcessingService } from "./messageProcessingService";

const T0 = new Date("2026-01-01T10:00:00Z");

function analysis(id: string, createdAt: Date, category = "INCIDENT") {
  return {
    id,
    messageId: "x",
    category,
    confidence: 0.9,
    summary: `summary ${id}`,
    priority: "HIGH",
    actionRequired: true,
    requestedAction: "Do it",
    people: ["Asha"],
    deadline: null,
    entities: ["server"],
    rawOutput: { secret: "raw" },
    model: "secret-model",
    promptVersion: "v1",
    createdAt,
    review: null as unknown,
  };
}

function message(id: string, overrides: Record<string, unknown> = {}): MessageWithHistory {
  return {
    id,
    whatsappMessageId: `w-${id}`,
    groupId: "g1",
    senderId: "s1",
    senderName: "Dipali",
    content: "hello",
    messageType: "TEXT",
    sentAt: T0,
    processingStatus: "COMPLETED",
    processingAttempts: 1,
    lastProcessingError: "internal boom",
    lastAttemptAt: T0,
    createdAt: T0,
    updatedAt: T0,
    analyses: [],
    finalResult: null,
    ...overrides,
  } as unknown as MessageWithHistory;
}

function fakeStore(messages: MessageWithHistory[]) {
  const calls: { status?: string; limit: number }[] = [];
  const store: MessageHistoryStore = {
    findHistory: async (query) => {
      calls.push(query);
      return messages
        .filter((m) => !query.status || m.processingStatus === query.status)
        .slice(0, query.limit);
    },
  };
  return { store, calls };
}

async function get(messages: MessageWithHistory[], path: string) {
  const { store, calls } = fakeStore(messages);
  const app = express();
  app.use(
    "/api/messages",
    createMessageRouter({} as unknown as MessageProcessingService, new MessageHistoryService(store)),
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/messages${path}`);
    return { status: res.status, body: (await res.json()) as any, calls }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } finally {
    server.close();
  }
}

const sample = [
  message("m1", { processingStatus: "COMPLETED" }),
  message("m2", { processingStatus: "FAILED", processingAttempts: 3 }),
  message("m3", { processingStatus: "PENDING", processingAttempts: 0 }),
];

describe("GET /api/messages", () => {
  it("returns messages, defaulting to every status", async () => {
    const { status, body, calls } = await get(sample, "");
    assert.equal(status, 200);
    assert.equal(body.messages.length, 3);
    assert.deepEqual(calls[0], { status: undefined, limit: 50 });
    assert.equal(body.messages[0].whatsappMessageId, "w-m1");
    assert.equal(body.messages[0].senderName, "Dipali");
  });

  it("treats status=ALL as no filter", async () => {
    const { body, calls } = await get(sample, "?status=ALL");
    assert.equal(body.messages.length, 3);
    assert.equal(calls[0].status, undefined);
  });

  it("filters by COMPLETED", async () => {
    const { body } = await get(sample, "?status=COMPLETED");
    assert.deepEqual(body.messages.map((m: { id: string }) => m.id), ["m1"]);
  });

  it("filters by FAILED", async () => {
    const { body } = await get(sample, "?status=FAILED");
    assert.deepEqual(body.messages.map((m: { id: string }) => m.id), ["m2"]);
    assert.equal(body.messages[0].processingAttempts, 3);
  });

  it("rejects an invalid status with 400", async () => {
    const { status, body, calls } = await get(sample, "?status=BOGUS");
    assert.equal(status, 400);
    assert.equal(body.error, "Invalid query");
    assert.equal(calls.length, 0);
  });

  it("validates and passes the limit", async () => {
    assert.equal((await get(sample, "?limit=0")).status, 400);
    assert.equal((await get(sample, "?limit=101")).status, 400);
    assert.equal((await get(sample, "?limit=abc")).status, 400);
    const ok = await get(sample, "?limit=2");
    assert.equal(ok.body.messages.length, 2);
    assert.equal(ok.calls[0].limit, 2);
  });

  it("returns a message with no AI analysis, review or final result", async () => {
    const { body } = await get([message("m1", { processingStatus: "PENDING" })], "");
    const m = body.messages[0];
    assert.equal(m.aiAnalysis, null);
    assert.equal(m.review, null);
    assert.equal(m.finalResult, null);
  });

  it("returns the latest AI analysis when several exist", async () => {
    const older = analysis("a-old", new Date("2026-01-01T10:00:00Z"), "QUESTION");
    const newer = analysis("a-new", new Date("2026-01-01T11:00:00Z"), "INCIDENT");
    const { body } = await get([message("m1", { analyses: [older, newer] })], "");
    assert.equal(body.messages[0].aiAnalysis.id, "a-new");
    assert.equal(body.messages[0].aiAnalysis.category, "INCIDENT");
  });

  it("includes review information when available", async () => {
    const ai = analysis("a1", T0);
    ai.review = {
      id: "r1",
      status: "APPROVED",
      reason: "Low confidence",
      reviewedAt: new Date("2026-01-02T00:00:00Z"),
      reviewerName: "private",
      notes: "private",
    };
    const { body } = await get([message("m1", { analyses: [ai] })], "");
    assert.deepEqual(Object.keys(body.messages[0].review).sort(), [
      "id",
      "reason",
      "reviewedAt",
      "status",
    ]);
    assert.equal(body.messages[0].review.status, "APPROVED");
    assert.equal(body.messages[0].review.reason, "Low confidence");
  });

  it("includes the final result when available", async () => {
    const finalResult = {
      id: "f1",
      messageId: "m1",
      aiAnalysisId: "a1",
      reviewId: "r1",
      category: "ROUTINE_UPDATE",
      summary: "Corrected",
      priority: "LOW",
      actionRequired: false,
      requestedAction: null,
      people: [],
      deadline: null,
      entities: ["a"],
      createdAt: new Date("2026-01-03T00:00:00Z"),
    };
    const { body } = await get([message("m1", { finalResult })], "");
    const f = body.messages[0].finalResult;
    assert.equal(f.category, "ROUTINE_UPDATE");
    assert.equal(f.summary, "Corrected");
    assert.equal(f.finalizedAt, "2026-01-03T00:00:00.000Z");
  });

  it("returns an empty list for an empty dataset", async () => {
    const { status, body } = await get([], "?status=COMPLETED");
    assert.equal(status, 200);
    assert.deepEqual(body, { messages: [] });
  });

  it("does not expose internal fields", async () => {
    const { body } = await get([message("m1", { analyses: [analysis("a1", T0)] })], "");
    const text = JSON.stringify(body);
    for (const leaked of ["rawOutput", "secret-model", "promptVersion", "internal boom", "lastProcessingError"]) {
      assert.ok(!text.includes(leaked), `leaked ${leaked}`);
    }
  });
});
