import "dotenv/config";
import { prisma } from "@repo/database";
import redis from "./redis";
import { initMessageWorker, messageQueue } from "./queue";
import { reconnectAllSessions } from "./sessions";

/**
 * Main worker entry point
 * Connects to DB, Redis, and starts processing jobs
 */
async function main() {
  console.log("[Worker] Starting UniboxAI WhatsApp Worker...");

  try {
    // Connect to Redis
    await redis.connect();

    // Connect to database
    const dbCheck = await prisma.$queryRaw`SELECT 1`;
    console.log("[Worker] Database connected");

    // Reconnect previously active sessions
    await reconnectAllSessions();

    // Initialize job worker
    await initMessageWorker();

    console.log("[Worker] Worker ready");

    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("[Worker] SIGTERM received, shutting down...");
      await redis.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    });
  } catch (err) {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  }
}

main();
