import { Router } from "express";
import type { WhatsAppService } from "../whatsapp/whatsappService";

export function createWhatsAppRouter(service: WhatsAppService): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(service.getStatus());
  });

  router.get("/qr", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ qr: service.getQrCode() });
  });

  return router;
}
