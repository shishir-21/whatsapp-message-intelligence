import type { MessageType } from "@prisma/client";
import { prisma } from "./prisma";

export interface IncomingMessage {
  whatsappMessageId: string;
  groupId: string; // Group.id (internal), not the WhatsApp group id
  senderId: string;
  senderName?: string | null;
  content: string;
  messageType: MessageType;
  sentAt: Date;
}

// Idempotent insert keyed on whatsappMessageId (INSERT ... ON CONFLICT DO
// NOTHING). A redelivered WhatsApp event returns { created: false } instead of
// creating a second row or throwing. There is deliberately no content-based
// dedup: the same text sent twice has two different WhatsApp message ids.
export async function saveIncomingMessage(
  message: IncomingMessage,
): Promise<{ created: boolean }> {
  const { count } = await prisma.message.createMany({
    data: [message],
    skipDuplicates: true,
  });
  return { created: count === 1 };
}
