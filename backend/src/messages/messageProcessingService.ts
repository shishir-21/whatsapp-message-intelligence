import type { AIProvider } from "../ai/types";
import { CATEGORY_TO_DB, PRIORITY_TO_DB, parseAIAnalysis } from "../ai/schema";
import { PROMPT_VERSION } from "../ai/prompt";
import type { NewAIAnalysis } from "../db/aiAnalysisRepository";
import type { MessageWithGroup } from "../db/messageRepository";

// Persistence operations the processor needs; the real implementation lives
// in the db repositories, tests substitute an in-memory one.
export interface ProcessingStore {
  findForProcessing(id: string): Promise<MessageWithGroup | null>;
  claimForProcessing(id: string): Promise<boolean>;
  saveAnalysisAndComplete(analysis: NewAIAnalysis): Promise<unknown>;
  markProcessingFailed(id: string, error: string): Promise<void>;
}

// What MessageService depends on; it knows nothing about AI providers.
export interface MessageProcessor {
  process(messageId: string): Promise<void>;
}

const log = (message: string) => console.log(`[ai] ${message}`);
const MAX_ERROR_LENGTH = 500;

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.slice(0, MAX_ERROR_LENGTH);
}

// A deadline the model gave as text; anything unparseable is dropped from
// the typed column (the original stays in rawOutput).
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class MessageProcessingService implements MessageProcessor {
  constructor(
    private readonly provider: AIProvider,
    private readonly store: ProcessingStore,
  ) {}

  // Processes one stored message: PENDING -> PROCESSING -> COMPLETED, or
  // FAILED on any error. Never rejects.
  async process(messageId: string): Promise<void> {
    let claimed = false;
    try {
      claimed = await this.store.claimForProcessing(messageId);
      if (!claimed) return;
      log(`processing ${messageId}`);

      const message = await this.store.findForProcessing(messageId);
      if (!message) throw new Error("Message not found");

      const content = message.content.trim();
      if (!content) throw new Error("Message has no text content to analyze");

      const response = await this.provider.analyze({
        content,
        senderName: message.senderName,
        messageType: message.messageType,
        sentAt: message.sentAt,
        groupName: message.group.name,
      });
      const result = parseAIAnalysis(response.content);

      await this.store.saveAnalysisAndComplete({
        messageId,
        category: CATEGORY_TO_DB[result.category],
        confidence: result.confidence,
        summary: result.summary,
        priority: PRIORITY_TO_DB[result.priority],
        actionRequired: result.actionRequired,
        requestedAction: result.requestedAction,
        people: result.people,
        deadline: toDate(result.deadline),
        entities: result.entities,
        rawOutput: result,
        model: response.model,
        promptVersion: PROMPT_VERSION,
      });
      log(`completed ${messageId}`);
    } catch (err) {
      const reason = errorMessage(err);
      log(`failed ${messageId}: ${reason}`);
      if (!claimed) return;
      try {
        await this.store.markProcessingFailed(messageId, reason);
      } catch (markErr) {
        log(`could not record failure for ${messageId}: ${errorMessage(markErr)}`);
      }
    }
  }
}
