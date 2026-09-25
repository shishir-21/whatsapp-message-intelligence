import { getSelectedGroup } from "../db/groupRepository";
import type { IncomingMessage } from "./types";

const log = (message: string) => console.log(`[messages] ${message}`);

// Receives normalized messages and keeps only those from the selected group.
// Persistence is not implemented yet.
export class MessageService {
  // Never rejects: a failure here must not affect the WhatsApp client.
  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    try {
      const selected = await getSelectedGroup();
      if (!selected || selected.whatsappGroupId !== message.whatsappGroupId) return;

      log(
        `accepted ${JSON.stringify({
          id: message.whatsappMessageId,
          group: message.whatsappGroupId,
          sender: message.senderId,
          senderName: message.senderName,
          type: message.messageType,
          at: message.timestamp.toISOString(),
          textLength: message.text?.length ?? 0,
        })}`,
      );
    } catch (err) {
      log(`failed to handle message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
