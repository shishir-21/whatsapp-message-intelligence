import express from "express";
import * as reviewRepository from "./db/reviewRepository";
import { ReviewService } from "./review/reviewService";
import { createReviewRouter } from "./routes/reviewRoutes";
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
app.use("/api/reviews", createReviewRouter(new ReviewService(reviewRepository)));

export default app;
