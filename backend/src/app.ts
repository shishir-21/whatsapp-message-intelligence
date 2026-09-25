import express from "express";
import * as reviewRepository from "./db/reviewRepository";
import { ReviewService } from "./review/reviewService";
import { createReviewRouter } from "./routes/reviewRoutes";
import { createWhatsAppRouter } from "./routes/whatsappRoutes";
import { whatsappService } from "./whatsapp";

const app = express();

// The review dashboard runs on this origin and calls the API from the browser.
const FRONTEND_ORIGIN = "http://localhost:3000";

app.use((req, res, next) => {
  if (req.headers.origin === FRONTEND_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "whatsapp-message-intelligence-backend",
  });
});

app.use("/api/whatsapp", createWhatsAppRouter(whatsappService));
app.use("/api/reviews", createReviewRouter(new ReviewService(reviewRepository)));

export default app;
