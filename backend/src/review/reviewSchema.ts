import { z } from "zod";
import { aiAnalysisResultSchema } from "../ai/schema";

const reviewerFields = {
  reviewerName: z.string().trim().min(1).max(100).optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
};

export const approveReviewSchema = z.object(reviewerFields).strict();

// The reviewer submits the complete final result (the UI pre-fills it from
// the AI output). Confidence is not accepted: it describes the AI run and
// stays on AIAnalysis. Unknown keys are rejected.
export const correctReviewSchema = aiAnalysisResultSchema
  .omit({ confidence: true, deadline: true })
  .extend({
    summary: z.string().trim().min(1).max(2000),
    requestedAction: z.string().trim().min(1).max(2000).nullable(),
    people: z.array(z.string().trim().min(1).max(200)).max(50),
    entities: z.array(z.string().trim().min(1).max(200)).max(100),
    deadline: z.iso
      .datetime({ offset: true })
      .nullable()
      .transform((value) => (value === null ? null : new Date(value))),
    ...reviewerFields,
  })
  .strict();

export type ApproveReviewInput = z.infer<typeof approveReviewSchema>;
export type CorrectReviewInput = z.infer<typeof correctReviewSchema>;
