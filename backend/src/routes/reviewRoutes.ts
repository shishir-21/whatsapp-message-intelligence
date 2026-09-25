import { Router, type Response } from "express";
import { ZodError } from "zod";
import { approveReviewSchema, correctReviewSchema } from "../review/reviewSchema";
import { ReviewConflictError, ReviewNotFoundError, type ReviewService } from "../review/reviewService";
import { toReviewView } from "../review/reviewView";

function sendError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  } else if (err instanceof ReviewNotFoundError) {
    res.status(404).json({ error: err.message });
  } else if (err instanceof ReviewConflictError) {
    res.status(409).json({ error: err.message });
  } else {
    console.error("[review] request failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export function createReviewRouter(service: ReviewService): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const reviews = await service.listPending();
      res.json({ reviews: reviews.map(toReviewView) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      res.json({ review: toReviewView(await service.get(req.params.id)) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/:id/approve", async (req, res) => {
    try {
      const input = approveReviewSchema.parse(req.body ?? {});
      res.json({ review: toReviewView(await service.approve(req.params.id, input)) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/:id/correct", async (req, res) => {
    try {
      const input = correctReviewSchema.parse(req.body);
      res.json({ review: toReviewView(await service.correct(req.params.id, input)) });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
