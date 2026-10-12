import dotenv from "dotenv";
import path from "node:path";

// Support running from either the repository root or server directory.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(helmet());
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    limit: Number(process.env.RATE_LIMIT_MAX || 30),
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SchemeSathi API",
    timestamp: new Date().toISOString(),
  });
});

// Chat will be enabled after the retrieval pipeline is implemented.
app.post("/api/chat", (_req, res) => {
  res.status(503).json({
    error: "The RAG pipeline is not configured yet.",
    message: "SchemeSathi chat is not available until document ingestion and retrieval are implemented.",
  });
});

app.listen(PORT, () => {
  console.log(`SchemeSathi API running at http://localhost:${PORT}`);
});
