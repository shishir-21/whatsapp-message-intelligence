import "dotenv/config";
import qrcodeTerminal from "qrcode-terminal";
import app from "./app";
import { whatsappService } from "./whatsapp";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// Local development convenience: render the QR in the terminal so it can be
// scanned without a frontend. Never printed in production logs.
if (process.env.NODE_ENV !== "production") {
  whatsappService.on("qr", (qr: string) => qrcodeTerminal.generate(qr, { small: true }));
}

// Runs in the background; failures are reported through the WhatsApp status
// and never stop the HTTP server.
void whatsappService.initialize();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  // Close the browser but keep the session so the next start skips the QR.
  await whatsappService.disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
