import "dotenv/config";
import * as Sentry from "@sentry/node";
import http from "http";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
});
import { prisma } from "./prisma.js";
import redis, { getSubscriber } from "./redis.js";
import { initMessageWorker } from "./queue.js";
import { initializeSession, disconnectSession, reconnectAllSessions } from "./sessions.js";

interface WorkerCommand {
  command: "start" | "stop" | "restart";
  sessionId: string;
  orgId: string;
}

async function main() {
  console.log("[Worker] Starting UniboxAI WhatsApp Worker...");

  // Validate encryption key early so sessions don't fail silently at auth time
  const encKey = process.env.SESSION_ENCRYPTION_KEY ?? "";
  const keyBuf = Buffer.from(encKey, "hex");
  if (keyBuf.length !== 32) {
    console.error(
      `[Worker] FATAL: SESSION_ENCRYPTION_KEY must be 32 bytes (64 hex chars). Got ${keyBuf.length} bytes.`,
      "\nGenerate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    process.exit(1);
  }

  await redis.connect();

  await prisma.$queryRaw`SELECT 1`;
  console.log("[Worker] Database connected");

  await reconnectAllSessions();

  await initMessageWorker();

  // Subscribe to commands from the web app
  const sub = await getSubscriber();
  await sub.subscribe("worker:commands", async (raw) => {
    try {
      const cmd: WorkerCommand = JSON.parse(raw);
      console.log(`[Worker] Command received: ${cmd.command} session ${cmd.sessionId}`);

      if (cmd.command === "start") {
        await initializeSession(cmd.sessionId, cmd.orgId);
      } else if (cmd.command === "stop") {
        await disconnectSession(cmd.sessionId);
      } else if (cmd.command === "restart") {
        // Destroy existing client if running, then start fresh (auth already cleared by web)
        await disconnectSession(cmd.sessionId);
        await initializeSession(cmd.sessionId, cmd.orgId);
      }
    } catch (err) {
      console.error("[Worker] Failed to process command:", err);
    }
  });

  console.log("[Worker] Ready — listening for commands on worker:commands");

  // Hourly check: alert admins about stale incomplete todos (> 4 hours old)
  const TODO_ALERT_INTERVAL = 60 * 60 * 1000; // 1 hour
  async function runTodoAlerts() {
    try {
      const webhookUrl = process.env.WORKER_WEBHOOK_URL ?? "http://localhost:3000";
      const secret = process.env.WORKER_WEBHOOK_SECRET ?? "";
      if (!secret) return;
      const body = JSON.stringify({ event: "cron.todo_alerts", payload: {}, ts: Date.now() });
      const sig = (await import("crypto")).createHmac("sha256", secret).update(body).digest("hex");
      await fetch(`${webhookUrl}/api/webhooks/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-signature": sig },
        body,
      });
    } catch (_) {}
  }
  setInterval(runTodoAlerts, TODO_ALERT_INTERVAL);

  const healthServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const healthPort = Number(process.env.HEALTH_PORT ?? 3001);
  healthServer.listen(healthPort, () => {
    console.log(`[Worker] Health check listening on :${healthPort}`);
  });

  process.on("SIGTERM", async () => {
    console.log("[Worker] SIGTERM — shutting down gracefully...");
    healthServer.close();
    await sub.unsubscribe("worker:commands");
    await redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  Sentry.captureException(err);
  console.error("[Worker] Fatal:", err);
  process.exit(1);
});
