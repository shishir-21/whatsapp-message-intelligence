import { GroqProvider } from "../ai/groqProvider";
import { saveAnalysisAndComplete } from "../db/aiAnalysisRepository";
import { claimForProcessing, findForProcessing, markProcessingFailed } from "../db/messageRepository";
import { MessageProcessingService } from "../messages/messageProcessingService";
import { MessageService } from "../messages/messageService";
import { createWhatsAppClient, loadWhatsAppClientConfig } from "./whatsappClient";
import { WhatsAppService } from "./whatsappService";

const config = loadWhatsAppClientConfig();

const processingService = new MessageProcessingService(new GroqProvider(), {
  findForProcessing,
  claimForProcessing,
  saveAnalysisAndComplete,
  markProcessingFailed,
});

// The one WhatsApp service instance for the process.
const messageService = new MessageService(processingService);

export const whatsappService = new WhatsAppService(
  (handlers) => createWhatsAppClient(config, handlers),
  (message) => void messageService.handleIncomingMessage(message),
);

export { WhatsAppService } from "./whatsappService";
export * from "./types";
