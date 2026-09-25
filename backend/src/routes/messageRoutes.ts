import { Router } from "express";
import { z } from "zod";
import {
  MessageNotFoundError,
  MessageRetryConflictError,
  type MessageRetrier,
} from "../messages/messageProcessingService";
import { historyQuerySchema, type MessageHistoryService } from "../messages/messageHistoryService";

const idSchema = z.uuid();

export function createMessageRouter(retrier: MessageRetrier, history?: MessageHistoryService): Router {
  const router = Router();

  // Read-only message history: ?status=ALL|PENDING|PROCESSING|COMPLETED|FAILED
  // (default ALL),
  // ?category=INCIDENT|CHANGE_REQUEST|... (resolved category) and
  // ?limit=1..100 (default 50).
  if (history) {
    router.get("/", async (req, res) => {
      const query = historyQuerySchema.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({
          error: "Invalid query",
          issues: query.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      try {
        res.json({ messages: await history.list(query.data) });
      } catch (err) {
        console.error("[messages] history request failed:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  }

  // Accepts a retry of a FAILED message; processing continues in the
  // background and the outcome is visible on the message afterwards.
  router.post("/:id/retry", async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid message id" });
      return;
    }
    try {
      const accepted = await retrier.retry(id.data);
      res.status(202).json({
        message: {
          id: accepted.messageId,
          processingStatus: "PROCESSING",
          processingAttempts: accepted.processingAttempts,
        },
      });
    } catch (err) {
      if (err instanceof MessageNotFoundError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof MessageRetryConflictError) {
        res.status(409).json({ error: err.message });
      } else {
        console.error("[messages] retry failed:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return router;
}
