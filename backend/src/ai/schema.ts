import type { MessageCategory, Priority } from "@prisma/client";
import { z } from "zod";

export const AI_CATEGORIES = [
  "Routine Update",
  "Incident",
  "Change Request",
  "Resource Update",
  "Question",
  "Irrelevant",
] as const;

// The single validation boundary for model output: nothing reaches the
// AIAnalysis table without passing through this schema.
export const aiAnalysisResultSchema = z.object({
  category: z.enum(AI_CATEGORIES),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  actionRequired: z.boolean(),
  requestedAction: z.string().nullable(),
  people: z.array(z.string()),
  deadline: z.string().nullable(),
  entities: z.array(z.string()),
});

export type AIAnalysisResult = z.infer<typeof aiAnalysisResultSchema>;

export class AIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIResponseError";
  }
}

// Parses the model's raw text as JSON and validates it. Throws
// AIResponseError for anything that is not exactly one valid JSON object.
export function parseAIAnalysis(rawText: string): AIAnalysisResult {
  let json: unknown;
  try {
    json = JSON.parse(rawText.trim());
  } catch {
    throw new AIResponseError("AI response was not valid JSON");
  }
  const parsed = aiAnalysisResultSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new AIResponseError(`AI response failed validation: ${issues}`);
  }
  return parsed.data;
}

export const CATEGORY_TO_DB: Record<AIAnalysisResult["category"], MessageCategory> = {
  "Routine Update": "ROUTINE_UPDATE",
  Incident: "INCIDENT",
  "Change Request": "CHANGE_REQUEST",
  "Resource Update": "RESOURCE_UPDATE",
  Question: "QUESTION",
  Irrelevant: "IRRELEVANT",
};

export const PRIORITY_TO_DB: Record<AIAnalysisResult["priority"], Priority> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};
