import { Router, type Response } from "express";
import {
  GroupNotFoundError,
  WhatsAppNotReadyError,
  type WhatsAppService,
} from "../whatsapp/whatsappService";

function sendError(res: Response, err: unknown): void {
  if (err instanceof WhatsAppNotReadyError) {
    res.status(409).json({ error: err.message });
  } else if (err instanceof GroupNotFoundError) {
    res.status(404).json({ error: err.message });
  } else {
    console.error("[whatsapp] group request failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export function createWhatsAppRouter(service: WhatsAppService): Router {
  const router = Router();

  // lastError can contain WPPConnect/Puppeteer internals, so the API only
  // reports whether one exists.
  const publicStatus = () => {
    const { status, lastError, updatedAt } = service.getStatus();
    return { status, hasError: lastError !== null, updatedAt };
  };

  router.get("/status", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(publicStatus());
  });

  // Starts (or reconnects) the client in the background. Idempotent: does
  // nothing if a client already exists. The QR is then served by GET /qr.
  router.post("/connect", (_req, res) => {
    void service.initialize();
    res.status(202).json(publicStatus());
  });

  router.get("/qr", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ qr: service.getQrCode() });
  });

  router.get("/groups", async (_req, res) => {
    try {
      res.json({ groups: await service.listGroups() });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/groups/select", async (req, res) => {
    const groupId: unknown = req.body?.groupId;
    if (typeof groupId !== "string" || groupId.trim() === "") {
      res.status(400).json({ error: "groupId must be a non-empty string" });
      return;
    }
    try {
      res.json({ group: await service.selectGroup(groupId.trim()) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/groups/selected", async (_req, res) => {
    try {
      const group = await service.getSelectedGroup();
      if (!group) {
        res.status(404).json({ error: "No group selected" });
        return;
      }
      res.json({ group });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
