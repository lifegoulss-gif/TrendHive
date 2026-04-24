import { prisma } from "./prisma.js";
import { Client } from "whatsapp-web.js";
import { PostgresAuth } from "./sessions/postgres-auth.js";
import { handleMessage } from "./sessions/message-handler.js";
import { resetRateLimit } from "./rate-limiter.js";
import { notifyWeb } from "./webhook.js";

const sessions = new Map<string, Client>();

const INIT_TIMEOUT_MS = 90_000; // 90s — enough for Puppeteer + WhatsApp page load

export async function initializeSession(
  sessionId: string,
  orgId: string
): Promise<Client> {
  // If a client is already running for this session, destroy it first.
  // This makes initializeSession idempotent and safe to call on reconnect.
  if (sessions.has(sessionId)) {
    console.log(`[Session] ${sessionId} already running — destroying before re-init`);
    try {
      await sessions.get(sessionId)!.destroy();
    } catch {}
    sessions.delete(sessionId);
  }

  console.log(`[Session] Initializing ${sessionId}`);

  let client!: Client;
  let auth!: PostgresAuth;

  try {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    auth = new PostgresAuth(sessionId);

    // Use system Chrome if available — avoids Chromium download and starts faster
    const systemChrome =
      process.env.CHROME_PATH ??
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : process.platform === "linux"
        ? "/usr/bin/google-chrome-stable"
        : undefined);

    client = new Client({
      authStrategy: auth as any,
      puppeteer: {
        headless: true,
        executablePath: systemChrome,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--no-first-run",
          "--disable-extensions",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-hang-monitor",
          "--disable-sync",
          "--disable-translate",
          "--metrics-recording-only",
          "--safebrowsing-disable-auto-update",
          "--password-store=basic",
          "--use-mock-keychain",
        ],
      },
    });

    // Add to map BEFORE initialize so the disconnected event handler can find it
    sessions.set(sessionId, client);

    // IMPORTANT: Register all listeners BEFORE client.initialize()
    client.on("qr", async (qr: string) => {
      console.log(`[Session] QR generated for ${sessionId}`);
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { pendingQr: qr, status: "CONNECTING" },
      });
      await notifyWeb("session.qr", { sessionId, orgId, qr });
    });

    client.on("ready", async () => {
      const phoneNumber = (client as any).info?.me?.user;
      const fullPhone = phoneNumber ? `+${phoneNumber}` : null;
      console.log(`[Session] ${sessionId} ready — phone: ${fullPhone}`);

      await auth.afterAuthReady();

      if (fullPhone) {
        await prisma.whatsAppSession.updateMany({
          where: { orgId, phoneNumber: fullPhone, id: { not: sessionId } },
          data: { phoneNumber: null },
        });
      }

      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: {
          status: "CONNECTED",
          phoneNumber: fullPhone,
          lastConnectedAt: new Date(),
          errorMessage: null,
          pendingQr: null,
        },
      });
      await notifyWeb("session.connected", { sessionId, orgId, phoneNumber: fullPhone });
    });

    client.on("message", async (msg: any) => {
      await handleMessage(msg, sessionId, orgId, "INBOUND");
    });

    client.on("message_create", async (msg: any) => {
      if (msg.fromMe) {
        await handleMessage(msg, sessionId, orgId, "OUTBOUND");
      }
    });

    client.on("disconnected", async (reason: string) => {
      console.log(`[Session] ${sessionId} disconnected — reason: ${reason}`);
      sessions.delete(sessionId);
      resetRateLimit(sessionId);
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: "DISCONNECTED", pendingQr: null },
      });
      await notifyWeb("session.disconnected", { sessionId, orgId });
    });

    client.on("auth_failure", async (msg: string) => {
      console.error(`[Session] ${sessionId} auth failure: ${msg}`);
      sessions.delete(sessionId);
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: "ERROR", errorMessage: "Authentication failed — scan QR again", pendingQr: null },
      });
      await notifyWeb("session.error", { sessionId, orgId });
    });

  } catch (err) {
    // Setup failed before we even started initialize() — ensure session never stays CONNECTING
    sessions.delete(sessionId);
    console.error(`[Session] ${sessionId} setup failed:`, err);
    await prisma.whatsAppSession.updateMany({
      where: { id: sessionId },
      data: { status: "ERROR", errorMessage: "Failed to start session — try reconnecting", pendingQr: null },
    });
    await notifyWeb("session.error", { sessionId, orgId });
    throw err;
  }

  // Race initialize against a timeout so we don't hang forever
  const initPromise = client.initialize();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Session init timeout after 90s")), INIT_TIMEOUT_MS)
  );

  try {
    await Promise.race([initPromise, timeoutPromise]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "frame detached" means stop() was called mid-init — not an error, just cancelled
    const cancelled = msg.includes("detached") || msg.includes("disposed") || msg.includes("destroyed");
    console.log(`[Session] ${sessionId} init ${cancelled ? "cancelled" : "failed"}:`, msg);
    sessions.delete(sessionId);
    try { await client.destroy(); } catch {}
    await prisma.whatsAppSession.updateMany({
      where: { id: sessionId },
      data: {
        status: cancelled ? "DISCONNECTED" : "ERROR",
        errorMessage: cancelled ? null : "Connection failed — try reconnecting",
        pendingQr: null,
      },
    });
    if (!cancelled) {
      await notifyWeb("session.error", { sessionId, orgId });
    }
    throw err;
  }

  return client;
}

export function getSession(sessionId: string): Client | undefined {
  return sessions.get(sessionId);
}

export async function disconnectSession(sessionId: string): Promise<void> {
  const client = sessions.get(sessionId);
  sessions.delete(sessionId);
  resetRateLimit(sessionId);

  if (client) {
    console.log(`[Session] Destroying client for ${sessionId}`);
    try { await client.destroy(); } catch {}
  }

  // updateMany silently no-ops if the session was deleted from DB
  await prisma.whatsAppSession.updateMany({
    where: { id: sessionId },
    data: { status: "DISCONNECTED", pendingQr: null },
  });
}

export async function reconnectAllSessions(): Promise<void> {
  // Stale CONNECTING sessions from a previous crashed run — reset them so users can retry manually
  const staleConnecting = await prisma.whatsAppSession.findMany({
    where: { status: "CONNECTING" },
    select: { id: true },
  });
  if (staleConnecting.length > 0) {
    await prisma.whatsAppSession.updateMany({
      where: { id: { in: staleConnecting.map((s) => s.id) } },
      data: { status: "DISCONNECTED", pendingQr: null },
    });
    console.log(`[Session] Reset ${staleConnecting.length} stale CONNECTING session(s) to DISCONNECTED`);
  }

  // Resume sessions that were CONNECTED before restart
  const active = await prisma.whatsAppSession.findMany({
    where: { status: "CONNECTED" },
    select: { id: true, orgId: true },
  });

  console.log(`[Session] Reconnecting ${active.length} previously-connected session(s)...`);

  // Limit concurrent reconnects to avoid spawning too many Chrome instances at once
  const CONCURRENCY = 3;
  for (let i = 0; i < active.length; i += CONCURRENCY) {
    const batch = active.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((s) =>
        initializeSession(s.id, s.orgId).catch((err) => {
          console.error(`[Session] Failed to reconnect ${s.id}:`, err);
        })
      )
    );
  }
}

export function isSessionHealthy(sessionId: string): boolean {
  const client = sessions.get(sessionId);
  return !!(client && !(client as any).pupPage?.isClosed?.());
}
