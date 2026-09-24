import express from "express";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "whatsapp-message-intelligence-backend",
  });
});

export default app;
