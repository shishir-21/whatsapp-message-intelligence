import express from "express";
import { createWhatsAppRouter } from "./routes/whatsappRoutes";
import { whatsappService } from "./whatsapp";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "whatsapp-message-intelligence-backend",
  });
});

app.use("/api/whatsapp", createWhatsAppRouter(whatsappService));

export default app;
