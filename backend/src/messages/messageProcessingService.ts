import type { AIProvider } from "../ai/types";
import { CATEGORY_TO_DB, PRIORITY_TO_DB, parseAIAnalysis } from "../ai/schema";
import { PROMPT_VERSION } from "../ai/prompt";
import type { NewAIAnalysis } from "../db/aiAnalysisRepository";
import type { MessageWithGroup } from "../db/messageRepository";
import { decideReview } from "../review/reviewDecision";
import type { ReviewDecision } from "../review/reviewDecision";

// Persistence operations the processor needs; the real implementation lives
// in the db repositories, tests substitute an in-memory one.
export interface ProcessingStore {
  findForProcessing(id: string): Promise<MessageWithGroup | null>;
  claimForProcessing(id: string): Promise<boolean>;
  // Atomically moves a FAILED message with fewer than maxAttempts attempts
  // back to PROCESSING, counting the attempt. False if it no longer qualifies.
  claimForRetry(id: string, maxAttempts: number): Promise<boolean>;
  saveAnalysisAndComplete(analysis: NewAIAnalysis, decision: ReviewDecision): Promise<unknown>;
  markProcessingFailed(id: string, error: string): Promise<void>;
}

// What MessageService depends on; it knows nothing about AI providers.
export interface MessageProcessor {
  process(messageId: string): Promise<void>;
}

export const MAX_PROCESSING_ATTEMPTS = 3;

export class MessageNotFoundError extends Error {
  constructor() {
    super("Message not found");
    this.name = "MessageNotFoundError";
  }
}

export class MessageRetryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageRetryConflictError";
  }
}

// Returned once a retry has been claimed. `completion` settles when the
// background processing finishes; it never rejects.
export interface RetryAccepted {
  messageId: string;
  processingAttempts: number;
  completion: Promise<void>;
}

// What the retry route depends on.
export interface MessageRetrier {
  retry(messageId: string): Promise<RetryAccepted>;
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
    private readonly reviewConfidenceThreshold: number,
  ) {}

  // Processes one stored message: PENDING -> PROCESSING -> COMPLETED, or
  // FAILED on any error. Never rejects.
  async process(messageId: string): Promise<void> {
    let claimed = false;
    try {
      claimed = await this.store.claimForProcessing(messageId);
    } catch (err) {
      log(`failed ${messageId}: ${errorMessage(err)}`);
      return;
    }
    if (claimed) await this.run(messageId);
  }

  // Manual retry of a FAILED message. Rejects with MessageNotFoundError or
  // MessageRetryConflictError; otherwise claims the message (atomically, so
  // concurrent retries cannot both win) and runs the normal pipeline in the
  // background. The attempt counter is never reset and the previous error is
  // kept until the new attempt records its own outcome.
  async retry(messageId: string): Promise<RetryAccepted> {
    const message = await this.store.findForProcessing(messageId);
    if (!message) throw new MessageNotFoundError();
    if (message.processingStatus !== "FAILED") {
      throw new MessageRetryConflictError("Only FAILED messages can be retried");
    }
    if (message.processingAttempts >= MAX_PROCESSING_ATTEMPTS) {
      throw new MessageRetryConflictError(
        `Maximum processing attempts (${MAX_PROCESSING_ATTEMPTS}) reached`,
      );
    }
    if (!(await this.store.claimForRetry(messageId, MAX_PROCESSING_ATTEMPTS))) {
      throw new MessageRetryConflictError("Message is no longer eligible for retry");
    }
    return {
      messageId,
      processingAttempts: message.processingAttempts + 1,
      completion: this.run(messageId),
    };
  }

  // Runs the pipeline for a message this caller has already claimed. Never
  // rejects: any error marks the message FAILED.
  private async run(messageId: string): Promise<void> {
    try {
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

      const analysis: NewAIAnalysis = {
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
      };
      const decision = decideReview(analysis, this.reviewConfidenceThreshold);
      await this.store.saveAnalysisAndComplete(analysis, decision);
      log(`completed ${messageId} (${decision.requiresReview ? "needs review" : "auto-accepted"})`);
    } catch (err) {
      const reason = errorMessage(err);
      log(`failed ${messageId}: ${reason}`);
      try {
        await this.store.markProcessingFailed(messageId, reason);
      } catch (markErr) {
        log(`could not record failure for ${messageId}: ${errorMessage(markErr)}`);
      }
    }
  }
}
