import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { Message } from "@prisma/client";

export const EXTRACT_TODO_SYSTEM_PROMPT = `You are an AI assistant for a WhatsApp business inbox used by companies like water delivery services, food delivery, logistics, and retail businesses in the UAE.

You receive WhatsApp conversations between CUSTOMERS and EMPLOYEES. Your job is to decide if action is needed and if so, write a short actionable todo.

WHEN TO SET is_actionable = false (NO todo needed):
- Pure greetings with no request: "Hello", "Hi", "Good morning", "Salam", "Hey"
- Acknowledgements with no follow-up needed: "Ok", "Thanks", "Thank you", "Got it", "Sure", "👍"
- Conversation closers: "Bye", "Take care", "No problem"
- If the employee already handled it in the conversation

WHEN TO SET is_actionable = true (create a todo):
- Any order or purchase intent: "3 bottles", "I need water", "Can I order..."
- Delivery requests or address sharing
- Questions that need a reply
- Complaints or issues
- Voice messages or photos (always need attention)
- Numbers alone (e.g. "3", "5") = order quantity
- "ok/yes" after discussing an order = confirmation needing action

Priority rules:
- URGENT: "urgent", "ASAP", "now", "empty", "no water", "need today", customer sounds frustrated
- HIGH: specific time mentioned ("by 2pm", "this evening"), repeat order
- NORMAL: standard order, question, delivery request
- LOW: only clear unsolicited spam/marketing

Title rules — KEEP IT SHORT (max 60 chars):
- Start with action verb
- Use customer name if known, otherwise phone number
- Be specific, no filler words

Good title examples:
- "Deliver 3 bottles → Ahmed"
- "Call back +971501234567"
- "Reply: price for 5-gallon → Sara"
- "Process order → +971501234567"
- "Check photo from Ahmed"`;

export const TODO_EXTRACTION_TOOL: Tool = {
  name: "enrich_todo",
  description: "Decide if this conversation needs action, and if so create a short todo.",
  input_schema: {
    type: "object",
    properties: {
      is_actionable: {
        type: "boolean",
        description: "false for pure greetings, thanks, or already-resolved chats. true if employee needs to do something.",
      },
      title: {
        type: "string",
        description: "Short action-oriented title. Use customer name if known, phone if not. Max 60 chars.",
      },
      description: {
        type: "string",
        description: "One sentence: what the customer needs and any urgency signals.",
      },
      deadline: {
        type: ["string", "null"],
        description: "ISO 8601 datetime if customer mentioned a specific time, otherwise null",
      },
      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        description: "LOW only for spam. NORMAL for standard. HIGH for time-sensitive. URGENT for immediate needs.",
      },
      is_spam: {
        type: "boolean",
        description: "true ONLY if this is clearly unsolicited marketing/spam unrelated to the business",
      },
    },
    required: ["is_actionable", "title", "description", "deadline", "priority", "is_spam"],
  },
};

export function buildConversationPrompt(
  messages: Message[],
  employeeName: string,
  contactName: string
): string {
  const contactPhone = messages.find((m) => m.direction === "INBOUND")?.from
    ?? messages.find((m) => m.direction === "OUTBOUND")?.to
    ?? "Unknown";

  const formattedPhone = `+${contactPhone.replace(/\D/g, "")}`;
  const displayContact = contactName !== contactPhone
    ? `${contactName} (${formattedPhone})`
    : formattedPhone;

  const sorted = messages
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const lines = sorted.map((m) => {
    const label = m.direction === "OUTBOUND" ? "EMPLOYEE" : "CUSTOMER";
    const ts = m.timestamp.toISOString();
    return `[${ts}] [${label}]: ${m.text}`;
  });

  const latestInbound = sorted.filter((m) => m.direction === "INBOUND").pop();
  const messageType = latestInbound?.text.startsWith("🎤") ? "voice message"
    : latestInbound?.text.startsWith("📷") ? "photo"
    : latestInbound?.text.startsWith("📄") ? "document"
    : "text message";

  return `Business WhatsApp conversation.
Employee: ${employeeName}
Customer: ${displayContact}
Latest message type: ${messageType}

Conversation:
${lines.join("\n")}

Create an improved, specific todo for the employee to handle this customer's ${messageType}.`;
}
