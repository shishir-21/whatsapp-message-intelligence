import type { MessageType } from "@prisma/client";
import { getSelectedGroup } from "../db/groupRepository";
import { create, isDuplicateMessageError } from "../db/messageRepository";
import type { IncomingMessage } from "./types";

const log = (message: string) => console.log(`[messages] ${message}`);

const MESSAGE_TYPES: Record<IncomingMessage["messageType"], MessageType> = {
  text: "TEXT",
  image: "IMAGE",
  other: "OTHER",
};

// Receives normalized messages, keeps only those from the selected group and
// persists them. Message text is never logged.
export class MessageService {
  // Never rejects: a failure here must not affect the WhatsApp client.
  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    const details = () =>
      JSON.stringify({
        id: message.whatsappMessageId,
        group: message.whatsappGroupId,
        sender: message.senderId,
        type: message.messageType,
        at: message.timestamp.toISOString(),
        textLength: message.text?.length ?? 0,
      });

    try {
      const selected = await getSelectedGroup();
      if (!selected || selected.whatsappGroupId !== message.whatsappGroupId) return;

      await create({
        whatsappMessageId: message.whatsappMessageId,
        groupId: selected.id,
        senderId: message.senderId,
        senderName: message.senderName ?? null,
        content: message.text ?? "",
        messageType: MESSAGE_TYPES[message.messageType],
        sentAt: message.timestamp,
      });
      log(`persisted ${details()}`);
    } catch (err) {
      if (isDuplicateMessageError(err)) {
        log(`duplicate ignored ${details()}`);
        return;
      }
      log(
        `failed to persist message ${message.whatsappMessageId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
