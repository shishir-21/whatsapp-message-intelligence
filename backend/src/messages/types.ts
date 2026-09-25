// Application-level view of a WhatsApp message. Raw WPPConnect message
// objects never leave the WhatsApp layer.
export interface IncomingMessage {
  whatsappMessageId: string;
  whatsappGroupId: string;
  senderId: string;
  senderName?: string;
  timestamp: Date;
  messageType: "text" | "image" | "other";
  text?: string;
}
