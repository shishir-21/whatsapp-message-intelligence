import type { AIAnalysis, MessageCategory, Priority } from "@prisma/client";
import { prisma } from "./prisma";

export interface NewAIAnalysis {
  messageId: string;
  category: MessageCategory;
  confidence: number;
  summary: string;
  priority: Priority;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: Date | null;
  entities: string[];
  rawOutput: object;
  model: string;
  promptVersion: string;
}

// Inserts a new analysis and marks the message COMPLETED in one transaction,
// so a message is never COMPLETED without its analysis. Earlier analyses are
// left untouched.
export async function saveAnalysisAndComplete(analysis: NewAIAnalysis): Promise<AIAnalysis> {
  const [created] = await prisma.$transaction([
    prisma.aIAnalysis.create({ data: analysis }),
    prisma.message.update({
      where: { id: analysis.messageId },
      data: { processingStatus: "COMPLETED", lastProcessingError: null },
    }),
  ]);
  return created;
}
