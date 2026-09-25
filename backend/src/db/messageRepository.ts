import { Prisma } from "@prisma/client";
import type { Message, MessageType, ProcessingStatus } from "@prisma/client";
import { prisma } from "./prisma";

export interface NewMessage {
  whatsappMessageId: string;
  groupId: string; // Group.id (internal), not the WhatsApp group id
  senderId: string;
  senderName?: string | null;
  content: string;
  messageType: MessageType;
  sentAt: Date;
}

export function findByWhatsAppMessageId(whatsappMessageId: string): Promise<Message | null> {
  return prisma.message.findUnique({ where: { whatsappMessageId } });
}

// Inserts a message; processing state uses the schema defaults (PENDING).
// Rejects with a unique-constraint error if whatsappMessageId already exists;
// callers detect that with isDuplicateMessageError. The unique index, not a
// prior lookup, is the source of truth, so concurrent duplicates are safe.
export function create(message: NewMessage): Promise<Message> {
  return prisma.message.create({ data: message });
}

// True only for a unique-constraint violation (Prisma P2002). Message has no
// unique column besides the generated id and whatsappMessageId, so on create
// this means the WhatsApp message id was already stored.
export function isDuplicateMessageError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export type MessageWithGroup = Message & { group: { name: string } };

export function findForProcessing(id: string): Promise<MessageWithGroup | null> {
  return prisma.message.findUnique({ where: { id }, include: { group: { select: { name: true } } } });
}

// Atomically moves a PENDING message to PROCESSING and counts the attempt.
// Returns false if another caller already claimed it (or it is not PENDING),
// which keeps a message from being processed twice.
export async function claimForProcessing(id: string): Promise<boolean> {
  const { count } = await prisma.message.updateMany({
    where: { id, processingStatus: "PENDING" },
    data: {
      processingStatus: "PROCESSING",
      processingAttempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  return count === 1;
}

// Atomically moves a FAILED message that still has attempts left back to
// PROCESSING and counts the attempt. The status/attempts guard makes it a
// compare-and-set: of concurrent retries exactly one gets true. The attempt
// counter is not reset and lastProcessingError is left for the new attempt
// to overwrite.
export async function claimForRetry(id: string, maxAttempts: number): Promise<boolean> {
  const { count } = await prisma.message.updateMany({
    where: { id, processingStatus: "FAILED", processingAttempts: { lt: maxAttempts } },
    data: {
      processingStatus: "PROCESSING",
      processingAttempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  return count === 1;
}

export async function markProcessingFailed(id: string, error: string): Promise<void> {
  await prisma.message.update({
    where: { id },
    data: { processingStatus: "FAILED", lastProcessingError: error },
  });
}

const historyInclude = {
  // Only the newest analysis; older runs are kept in the database but are not
  // part of the history list.
  analyses: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { review: true },
  },
  finalResult: true,
} satisfies Prisma.MessageInclude;

export type MessageWithHistory = Prisma.MessageGetPayload<{ include: typeof historyInclude }>;

// Newest messages first. `status` undefined means every processing status.
export function findHistory(query: {
  status?: ProcessingStatus;
  limit: number;
}): Promise<MessageWithHistory[]> {
  return prisma.message.findMany({
    where: query.status ? { processingStatus: query.status } : undefined,
    include: historyInclude,
    // id breaks ties so the order is stable.
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });
}
