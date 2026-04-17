import { prisma } from "@repo/database";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

/**
 * Sessions map: sessionId -> Client instance
 */
const sessions = new Map<string, Client>();

/**
 * Create and initialize a WhatsApp session
 * Uses Postgres-backed LocalAuth to persist across restarts
 */
export async function initializeSession(
  sessionId: string,
  orgId: string
): Promise<Client> {
  // Check if already initialized
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  console.log(`[Session] Initializing ${sessionId} for org ${orgId}`);

  // Fetch session record
  const session = await prisma.whatsAppSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found in database`);
  }

  // Initialize whatsapp-web.js client with Postgres-backed auth
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: "./sessions", // Will be encrypted/persisted
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  /**
   * QR code for user to scan
   */
  client.on("qr", (qr: string) => {
    console.log("[Session] QR Code received:"); // In prod: emit via Pusher to frontend
    qrcode.generate(qr, { small: true });

    // TODO: Emit to Pusher so dashboard can show QR
    // await pusher.trigger(`session:${sessionId}`, "qr-code", { qr });
  });

  /**
   * Session ready
   */
  client.on("ready", async () => {
    console.log(`[Session] ${sessionId} ready`);

    // Get phone number
    const phoneNumber = client.info?.me?.user;

    // Update session status in DB
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: "CONNECTED",
        phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
        lastConnectedAt: new Date(),
        lastErrorAt: null,
        errorMessage: null,
      },
    });

    // TODO: Emit connected event to Pusher
  });

  /**
   * Incoming message
   */
  client.on("message", async (msg) => {
    // TODO: messageListener(msg, sessionId, orgId);
  });

  /**
   * Session disconnected
   */
  client.on("disconnected", async () => {
    console.log(`[Session] ${sessionId} disconnected`);

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { status: "DISCONNECTED" },
    });

    sessions.delete(sessionId);
  });

  /**
   * Error
   */
  client.on("auth_failure", async () => {
    console.error(`[Session] ${sessionId} auth failure`);

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: "ERROR",
        errorMessage: "Authentication failure",
        lastErrorAt: new Date(),
      },
    });

    sessions.delete(sessionId);
  });

  // Initialize (will show QR if first login)
  try {
    await client.initialize();
    sessions.set(sessionId, client);
  } catch (err) {
    console.error(`[Session] Failed to initialize ${sessionId}:`, err);

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: "ERROR",
        errorMessage: String(err),
        lastErrorAt: new Date(),
      },
    });

    throw err;
  }

  return client;
}

/**
 * Get active session client
 */
export function getSession(sessionId: string): Client | undefined {
  return sessions.get(sessionId);
}

/**
 * Gracefully disconnect session
 */
export async function disconnectSession(sessionId: string) {
  const client = sessions.get(sessionId);
  if (!client) return;

  console.log(`[Session] Disconnecting ${sessionId}`);
  await client.destroy();
  sessions.delete(sessionId);

  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { status: "DISCONNECTED" },
  });
}

/**
 * Reconnect all active sessions on startup
 */
export async function reconnectAllSessions() {
  console.log("[Session] Reconnecting all active sessions...");

  const activeSessions = await prisma.whatsAppSession.findMany({
    where: {
      orgId: { not: null }, // Get all
    },
  });

  for (const session of activeSessions) {
    if (session.status === "CONNECTED") {
      try {
        await initializeSession(session.id, session.orgId);
      } catch (err) {
        console.error(`[Session] Failed to reconnect ${session.id}:`, err);
      }
    }
  }
}

/**
 * Check session health
 */
export function isSessionHealthy(sessionId: string): boolean {
  const client = sessions.get(sessionId);
  return client?.pupPage?.isClosed?.() === false;
}
