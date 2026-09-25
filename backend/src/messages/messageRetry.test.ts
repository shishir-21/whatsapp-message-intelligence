import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import express from "express";
import type { AIProvider } from "../ai/types";
import type { NewAIAnalysis } from "../db/aiAnalysisRepository";
import type { MessageWithGroup } from "../db/messageRepository";
import { createMessageRouter } from "../routes/messageRoutes";
import {
  MAX_PROCESSING_ATTEMPTS,
  MessageNotFoundError,
  MessageProcessingService,
  MessageRetryConflictError,
  type ProcessingStore,
} from "./messageProcessingService";

const THRESHOLD = 0.8;
const ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "22222222-2222-4222-8222-222222222222";

const goodOutput = JSON.stringify({
  category: "Question",
  confidence: 0.9,
  summary: "Asks about a meeting.",
  priority: "low",
  actionRequired: false,
  requestedAction: null,
  people: [],
  deadline: null,
  entities: [],
});

// In-memory store with the same compare-and-set rules as the repository.
function fakeStore(initial: Partial<MessageWithGroup> = {}) {
  const msg: MessageWithGroup = {
    id: ID,
    whatsappMessageId: "w1",
    groupId: "g1",
    senderId: "s1",
    senderName: "Asha",
    content: "Can we meet tomorrow?",
    messageType: "TEXT",
    sentAt: new Date("2026-01-01T10:00:00Z"),
    processingStatus: "FAILED",
    processingAttempts: 1,
    lastProcessingError: "Groq down",
    lastAttemptAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    group: { name: "Ops" },
    ...initial,
  };
  const saved: NewAIAnalysis[] = [];
  const store: ProcessingStore = {
    findForProcessing: async (id) => (id === msg.id ? { ...msg } : null),
    claimForProcessing: async () => false,
    claimForRetry: async (id, max) => {
      await Promise.resolve(); // let concurrent callers interleave
      if (id !== msg.id || msg.processingStatus !== "FAILED" || msg.processingAttempts >= max) {
        return false;
      }
      msg.processingStatus = "PROCESSING";
      msg.processingAttempts += 1;
      msg.lastAttemptAt = new Date();
      return true;
    },
    saveAnalysisAndComplete: async (analysis) => {
      saved.push(analysis);
      msg.processingStatus = "COMPLETED";
      msg.lastProcessingError = null;
    },
    markProcessingFailed: async (_id, error) => {
      msg.processingStatus = "FAILED";
      msg.lastProcessingError = error;
    },
  };
  return { store, msg, saved };
}

function service(store: ProcessingStore, provider?: AIProvider) {
  let calls = 0;
  const p: AIProvider = provider ?? {
    analyze: async () => {
      calls += 1;
      return { model: "test-model", content: goodOutput };
    },
  };
  return { svc: new MessageProcessingService(p, store, THRESHOLD), calls: () => calls };
}

describe("MessageProcessingService.retry", () => {
  it("retries a FAILED message through the normal pipeline", async () => {
    const { store, msg, saved } = fakeStore();
    const { svc } = service(store);
    const accepted = await svc.retry(ID);
    assert.equal(accepted.processingAttempts, 2);
    await accepted.completion;
    assert.equal(msg.processingStatus, "COMPLETED");
    assert.equal(msg.processingAttempts, 2);
    assert.equal(msg.lastProcessingError, null);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].category, "QUESTION");
  });

  it("keeps the previous error until the attempt finishes", async () => {
    const { store, msg } = fakeStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { svc } = service(store, {
      analyze: async () => {
        await gate;
        return { model: "m", content: goodOutput };
      },
    });
    const accepted = await svc.retry(ID);
    assert.equal(msg.processingStatus, "PROCESSING");
    assert.equal(msg.lastProcessingError, "Groq down");
    release();
    await accepted.completion;
  });

  it("marks FAILED again with a new error and no analysis when the retry fails", async () => {
    const { store, msg, saved } = fakeStore();
    const { svc } = service(store, {
      analyze: async () => {
        throw new Error("still down");
      },
    });
    const accepted = await svc.retry(ID);
    await accepted.completion;
    assert.equal(msg.processingStatus, "FAILED");
    assert.equal(msg.processingAttempts, 2);
    assert.equal(msg.lastProcessingError, "still down");
    assert.ok(msg.lastAttemptAt instanceof Date);
    assert.equal(saved.length, 0);
  });

  it("rejects a message that is not FAILED", async () => {
    for (const status of ["PENDING", "PROCESSING", "COMPLETED"] as const) {
      const { store, msg } = fakeStore({ processingStatus: status });
      const { svc, calls } = service(store);
      await assert.rejects(svc.retry(ID), MessageRetryConflictError);
      assert.equal(msg.processingStatus, status);
      assert.equal(calls(), 0);
    }
  });

  it("rejects after the maximum attempts without resetting the counter", async () => {
    const { store, msg } = fakeStore({ processingAttempts: MAX_PROCESSING_ATTEMPTS });
    const { svc, calls } = service(store);
    await assert.rejects(svc.retry(ID), MessageRetryConflictError);
    assert.equal(msg.processingAttempts, MAX_PROCESSING_ATTEMPTS);
    assert.equal(msg.processingStatus, "FAILED");
    assert.equal(calls(), 0);
  });

  it("allows the last permitted attempt", async () => {
    const { store, msg } = fakeStore({ processingAttempts: MAX_PROCESSING_ATTEMPTS - 1 });
    const { svc } = service(store);
    await (await svc.retry(ID)).completion;
    assert.equal(msg.processingAttempts, MAX_PROCESSING_ATTEMPTS);
    assert.equal(msg.processingStatus, "COMPLETED");
  });

  it("rejects an unknown message", async () => {
    const { store } = fakeStore();
    const { svc } = service(store);
    await assert.rejects(svc.retry(UNKNOWN_ID), MessageNotFoundError);
  });

  it("processes a message only once when retries run concurrently", async () => {
    const { store, msg, saved } = fakeStore();
    const { svc, calls } = service(store);
    const results = await Promise.allSettled([svc.retry(ID), svc.retry(ID), svc.retry(ID)]);
    const accepted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 2);
    for (const r of rejected) assert.ok(r.reason instanceof MessageRetryConflictError);
    await accepted[0].value.completion;
    assert.equal(calls(), 1);
    assert.equal(saved.length, 1);
    assert.equal(msg.processingAttempts, 2);
  });
});

describe("POST /api/messages/:id/retry", () => {
  async function withServer(
    store: ProcessingStore,
    run: (post: (id: string) => Promise<{ status: number; body: unknown }>) => Promise<void>,
  ) {
    const app = express();
    app.use("/api/messages", createMessageRouter(service(store).svc));
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      await run(async (id) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/messages/${id}/retry`, {
          method: "POST",
        });
        return { status: res.status, body: await res.json() };
      });
    } finally {
      server.close();
    }
  }

  it("returns 202 with a concise body", async () => {
    const { store } = fakeStore();
    await withServer(store, async (post) => {
      const { status, body } = await post(ID);
      assert.equal(status, 202);
      assert.deepEqual(body, {
        message: { id: ID, processingStatus: "PROCESSING", processingAttempts: 2 },
      });
    });
  });

  it("returns 400 for a malformed id", async () => {
    const { store } = fakeStore();
    await withServer(store, async (post) => {
      assert.equal((await post("not-a-uuid")).status, 400);
    });
  });

  it("returns 404 for an unknown message", async () => {
    const { store } = fakeStore();
    await withServer(store, async (post) => {
      assert.equal((await post(UNKNOWN_ID)).status, 404);
    });
  });

  it("returns 409 when not FAILED or attempts are exhausted", async () => {
    for (const initial of [
      { processingStatus: "COMPLETED" as const },
      { processingAttempts: MAX_PROCESSING_ATTEMPTS },
    ]) {
      const { store } = fakeStore(initial);
      await withServer(store, async (post) => {
        assert.equal((await post(ID)).status, 409);
      });
    }
  });
});
