import { MessageService } from "../messages/messageService";
import { createWhatsAppClient, loadWhatsAppClientConfig } from "./whatsappClient";
import { WhatsAppService } from "./whatsappService";

const config = loadWhatsAppClientConfig();

// The one WhatsApp service instance for the process.
const messageService = new MessageService();

export const whatsappService = new WhatsAppService(
  (handlers) => createWhatsAppClient(config, handlers),
  (message) => void messageService.handleIncomingMessage(message),
);

export { WhatsAppService } from "./whatsappService";
export * from "./types";
