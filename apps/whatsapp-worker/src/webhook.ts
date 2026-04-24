import crypto from "crypto";

const WEBHOOK_URL = process.env.WORKER_WEBHOOK_URL ?? "http://localhost:3000";
const SECRET = process.env.WORKER_WEBHOOK_SECRET ?? "";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function notifyWeb(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!SECRET) {
    console.warn(`[Webhook] WORKER_WEBHOOK_SECRET not set — skipping ${event}`);
    return;
  }

  const body = JSON.stringify({ event, payload, ts: Date.now() });
  const sig = sign(body);

  const delays = [0, 1000, 2000]; // 3 attempts: immediate, 1s, 2s
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    try {
      const res = await fetch(`${WEBHOOK_URL}/api/webhooks/worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-signature": sig,
        },
        body,
      });
      if (res.ok) return;
      console.error(`[Webhook] ${event} → HTTP ${res.status} (attempt ${i + 1}/3)`);
    } catch (err) {
      console.error(`[Webhook] ${event} failed (attempt ${i + 1}/3):`, err);
    }
  }
  console.error(`[Webhook] ${event} — all 3 attempts failed`);
}
