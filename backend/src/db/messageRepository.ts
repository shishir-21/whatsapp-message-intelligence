import { Prisma } from "@prisma/client";
import type { Message, MessageType } from "@prisma/client";
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
