import dotenv from "dotenv";
import path from "node:path";

// Support running from either the repository root or server directory.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config/index.js";
import { chatRouter } from "./routes/chat.js";

export const app = express();
const PORT = Number(config.PORT || 5000);
const allowedOrigin = config.CORS_ORIGIN || "http://localhost:3000";

app.use(helmet());
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

// Rate limiting middleware
app.use(
  rateLimit({
    windowMs: Number(config.RATE_LIMIT_WINDOW_MS || 60000),
    limit: Number(config.RATE_LIMIT_MAX || 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again after a minute." },
  }),
);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SchemeSathi API",
    version: "Phase 1",
    timestamp: new Date().toISOString(),
    config: {
      llmProvider: config.LLM_PROVIDER,
      embeddingProvider: config.EMBEDDING_PROVIDER,
      minSimilarity: config.MIN_SIMILARITY,
      topK: config.TOP_K,
    },
  });
});

// Grounded RAG Chat endpoint
app.use("/api/chat", chatRouter);

// Start server only when run directly
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`SchemeSathi API running at http://localhost:${PORT}`);
  });
}
