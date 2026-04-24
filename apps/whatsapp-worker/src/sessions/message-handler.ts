import type { Message as WAMessage } from "whatsapp-web.js";
import { prisma } from "../prisma.js";
import Pusher from "pusher";
import { messageQueue } from "../queue.js";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

function getMediaLabel(type: string): string {
  switch (type) {
    case "ptt":
    case "audio": return "🎤 Voice message";
    case "image": return "📷 Photo";
    case "video": return "🎥 Video";
    case "document": return "📄 Document";
    case "sticker": return "Sticker";
    default: return "";
  }
}

// Pure greeting/ack patterns — skip instant todo creation (Claude will confirm)
const GREETING_RE = /^(hi|hello|hey|salam|السلام|مرحبا|ok|okay|sure|thanks|thank you|شكرا|👍|🙏|bye|no problem|got it|noted|good morning|good evening|صباح الخير|مساء الخير)\s*[!.،,]*$/i;

function buildTodoTitle(phone: string, text: string, contactName?: string | null): string {
  const formatted = `+${phone.replace(/\D/g, "")}`;
  const display = contactName && contactName !== phone && contactName !== formatted
    ? `${contactName} (${formatted})`
    : formatted;
  const preview = text.slice(0, 50).trim();
  return `${display}: ${preview}`;
}

/**
 * Full message pipeline:
 * WA event → deduplicate → insert Message → instant todo → Pusher → enqueue AI enrichment
 */
export async function handleMessage(
  msg: WAMessage,
  sessionId: string,
  orgId: string,
  direction: "INBOUND" | "OUTBOUND"
): Promise<void> {
  try {
    const wamId = msg.id._serialized;
    const rawFrom: string = msg.from ?? "";
    const rawTo: string = msg.to ?? "";

    // Skip group chats before stripping — group JIDs contain @g.us or a hyphen in the number part
    if (rawFrom.includes("@g.us") || rawFrom.includes("-@")) return;

    const from = rawFrom.replace(/@.*/, "");
    const to = rawTo.replace(/@.*/, "");
    const contactPhone = direction === "INBOUND" ? from : to;
    const hasMedia = (msg as any).hasMedia ?? false;
    const msgType: string = (msg as any).type ?? "chat";

    // Build message text — handle media gracefully
    let text = msg.body ?? "";
    if (!text && hasMedia) {
      const label = getMediaLabel(msgType);
      text = label || "[Media message]";
    }
    if (!text) return;

    // Determine media type for DB
    const mediaTypeMap: Record<string, "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"> = {
      image: "IMAGE",
      ptt: "AUDIO",
      audio: "AUDIO",
      video: "VIDEO",
      document: "DOCUMENT",
    };
    const mediaType = hasMedia ? (mediaTypeMap[msgType] ?? undefined) : undefined;

    // 1. Insert — unique wamId constraint rejects duplicates atomically (no check-then-act race)
    let message;
    try {
      message = await prisma.message.create({
        data: {
          orgId,
          sessionId,
          from,
          to,
          text,
          direction,
          wamId,
          timestamp: new Date(msg.timestamp * 1000),
          aiProcessed: false,
          ...(mediaType ? { mediaType } : {}),
        },
      });
    } catch (err: any) {
      // P2002 = unique constraint — WhatsApp resent a message we already stored
      if (err?.code === "P2002") return;
      throw err;
    }

    const contactName: string | null = direction === "INBOUND"
      ? ((msg as any).notifyName ?? null)
      : null;

    // 3. INSTANT TODO for actionable INBOUND messages — zero delay, 100% capture
    //    Greetings are skipped here; Claude will confirm via AI enrichment
    //    AI will enrich the title 5s later via the queue
    if (direction === "INBOUND") {
      const isGreeting = GREETING_RE.test(text.trim());
      if (!isGreeting) {
        const todoTitle = buildTodoTitle(contactPhone, text, contactName);
        await prisma.todo.create({
          data: {
            orgId,
            messageId: message.id,
            title: todoTitle,
            description: `Customer sent: "${text}"${contactName ? ` (${contactName})` : ""}`,
            priority: "NORMAL",
          },
        });
      }

      // Notify dashboard immediately
      await pusher.trigger(`private-${orgId}-todos`, "todo.new", {
        contactPhone,
        text,
        orgId,
      }).catch(() => {});
    }

    // 4. Push message to dashboard
    await pusher.trigger(`private-${orgId}-messages`, "message.new", {
      id: message.id,
      from,
      to,
      contactPhone,
      contactName,
      body: text,
      direction,
      timestamp: message.timestamp,
      sessionId,
    }).catch(() => {});

    // 5. Enqueue AI enrichment for INBOUND messages — 5s delay (batch rapid fire)
    if (direction === "INBOUND") {
      const jobId = `analyze:${sessionId}:${contactPhone}`;
      await messageQueue.add(
        "analyze-conversation",
        {
          type: "process_message",
          messageId: message.id,
          orgId,
          sessionId,
          contactId: contactPhone,
          contactName: contactName ?? contactPhone,
        },
        { jobId, delay: 5_000, removeOnComplete: true }
      );
    }

    console.log(`[Message] ${direction} ${from}→${to}: "${text.slice(0, 60)}"`);
  } catch (err) {
    console.error(`[Message] Pipeline error for session ${sessionId}:`, err);
  }
}
