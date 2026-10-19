import dotenv from "dotenv";
import path from "node:path";

// Support running from either the repository root or server directory.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { config } from "./config/index.js";
import { chatRouter } from "./routes/chat.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();
const allowedOrigin = config.CORS_ORIGIN || "http://localhost:3000";

// Security headers
app.use(helmet());

// CORS restricted to configured origin
app.use(cors({ origin: allowedOrigin }));

// Strict body size limit (10kb)
app.use(express.json({ limit: "10kb" }));

// Rate limiting middleware using configured limits with unref'd timer
const rateLimitStore = new MemoryStore();
const limiter = rateLimit({
  windowMs: Number(config.RATE_LIMIT_WINDOW_MS || 60000),
  limit: Number(config.RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again after a minute." },
  store: rateLimitStore,
});
if (rateLimitStore.interval && typeof rateLimitStore.interval.unref === "function") {
  rateLimitStore.interval.unref();
}
app.use(limiter);

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

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Centralised error handling middleware
app.use(errorHandler);
