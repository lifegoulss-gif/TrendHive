import "dotenv/config";
import { initializeSession } from "./sessions";
import { prisma } from "./prisma.js";

/**
 * Sandbox mode: spin up a throwaway WA session for testing
 * DO NOT use a real number!
 *
 * Usage:
 *   pnpm worker:sandbox
 *   Scan QR code with test phone
 *   Send messages and see logs
 *
 * Ctrl+C to exit
 */
async function sandbox() {
  console.log("[Sandbox] Starting...");
  console.log(
    "[Sandbox] ⚠️  DO NOT use a real phone number. Use a test device only."
  );

  try {
    // Create a temporary sandbox org + session
    const org = await prisma.organization.create({
      data: {
        name: "Sandbox Org",
        slug: `sandbox-${Date.now()}`,
      },
    });

    const session = await prisma.whatsAppSession.create({
      data: {
        orgId: org.id,
        name: "Sandbox Session",
        status: "CONNECTING",
      },
    });

    console.log(`[Sandbox] Session ID: ${session.id}`);
    console.log(`[Sandbox] Scan the QR code with your test phone...`);

    // Initialize session (will show QR)
    const client = await initializeSession(session.id, org.id);

    // Keep running until interrupted
    await new Promise((_resolve) => {
      process.on("SIGINT", async () => {
        console.log("[Sandbox] Shutting down...");

        await client.destroy();

        // Cleanup
        await prisma.whatsAppSession.delete({
          where: { id: session.id },
        });
        await prisma.organization.delete({
          where: { id: org.id },
        });

        process.exit(0);
      });
    });
  } catch (err) {
    console.error("[Sandbox] Error:", err);
    process.exit(1);
  }
}

sandbox();
