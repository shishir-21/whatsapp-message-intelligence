import { createWhatsAppClient, loadWhatsAppClientConfig } from "./whatsappClient";
import { WhatsAppService } from "./whatsappService";

const config = loadWhatsAppClientConfig();

// The one WhatsApp service instance for the process.
export const whatsappService = new WhatsAppService((handlers) =>
  createWhatsAppClient(config, handlers),
);

export { WhatsAppService } from "./whatsappService";
export * from "./types";
