import dotenv from "dotenv";
import path from "node:path";

// Support running from either the repository root or server directory.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

import { app } from "./app.js";
import { config } from "./config/index.js";
import { connectToDatabase, closeDatabaseConnection } from "./db/index.js";

const PORT = Number(config.PORT || 5000);

export async function startServer() {
  try {
    await connectToDatabase();
  } catch (err: any) {
    console.error(`⚠️ Warning: MongoDB connection failed (${err?.message || err}). Server starting in degraded mode.`);
  }

  const server = app.listen(PORT, () => {
    console.log(`SchemeSathi API running at http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await closeDatabaseConnection();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

// Start server on direct execution
startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
