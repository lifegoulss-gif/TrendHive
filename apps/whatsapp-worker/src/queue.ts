import { Worker, Queue } from "bullmq";
import { prisma } from "./prisma.js";
import type { Priority } from "@prisma/client";
import Pusher from "pusher";
import { getSession } from "./sessions.js";
import { tryConsumeToken, getWaitTime } from "./rate-limiter.js";
import { extractTodo } from "./ai/extract-todo.js";

function getBullMQConnection() {
  const url = process.env.UPSTASH_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

const connection = getBullMQConnection();
export const messageQueue = new Queue("messages", { connection });

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export interface SendMessageJob {
  type: "send_message";
  sessionId: string;
  to: string;
  text: string;
  orgId: string;
}

export interface AnalyzeConversationJob {
  type: "process_message";
  messageId: string;
  orgId: string;
  sessionId: string;
  contactId: string;
  contactName?: string;
}

export type WorkerJob = SendMessageJob | AnalyzeConversationJob;

// Maps Claude's priority labels to the Prisma Priority enum.
// Claude uses "MEDIUM"; Prisma uses "NORMAL".
function mapPriority(p: string): Priority {
  const map: Record<string, Priority> = {
    LOW: "LOW",
    MEDIUM: "NORMAL",
    HIGH: "HIGH",
    URGENT: "URGENT",
  };
  return map[p] ?? "NORMAL";
}

async function sendMessage(data: SendMessageJob): Promise<void> {
  const client = getSession(data.sessionId);
  if (!client) throw new Error(`Session ${data.sessionId} not connected`);

  if (!tryConsumeToken(data.sessionId)) {
    const wait = getWaitTime(data.sessionId);
    await prisma.whatsAppSession.update({
      where: { id: data.sessionId },
      data: { status: "ERROR", errorMessage: `Rate limited — retry in ${wait}ms` },
    });
    throw new Error(`Rate limited — retry in ${wait}ms`);
  }

  await client.sendMessage(`${data.to}@c.us`, data.text);
  console.log(`[Queue] Sent message to ${data.to} via session ${data.sessionId}`);
}

async function analyzeConversation(data: AnalyzeConversationJob): Promise<void> {
  const phone = data.contactId;
  const messages = await prisma.message.findMany({
    where: {
      orgId: data.orgId,
      sessionId: data.sessionId,
      OR: [{ from: phone }, { to: phone }],
    },
    orderBy: { timestamp: "desc" },
    take: 10,
  });

  if (!messages.length) return;

  const latestInbound = messages.find((m) => m.direction === "INBOUND");
  if (!latestInbound) return;
  if (latestInbound.aiProcessed) return;

  await prisma.message.updateMany({
    where: { id: { in: messages.map((m) => m.id) }, orgId: data.orgId },
    data: { aiProcessed: true },
  });

  const session = await prisma.whatsAppSession.findUnique({
    where: { id: data.sessionId },
    select: { name: true, phoneNumber: true },
  });
  const employeeName = session?.name ?? session?.phoneNumber ?? "Employee";
  const contactName = data.contactName ?? phone;

  const result = await extractTodo(messages, employeeName, contactName);
  if (!result) return;

  // Find the instant todo created by message-handler and ENRICH it with AI
  const instantTodo = await prisma.todo.findFirst({
    where: { orgId: data.orgId, messageId: latestInbound.id, completed: false },
  });

  const priority = mapPriority(result.priority);
  const dueDate = result.deadline ? new Date(result.deadline) : null;

  if (instantTodo) {
    // Not actionable (greeting, thanks, etc.) — remove the placeholder todo silently
    if (!result.is_actionable) {
      await prisma.todo.delete({ where: { id: instantTodo.id } });
      console.log(`[AI] Removed non-actionable todo ${instantTodo.id} (greeting/ack)`);
      await pusher.trigger(`private-${data.orgId}-todos`, "todo.deleted", {
        todoId: instantTodo.id,
        orgId: data.orgId,
      }).catch(() => {});
      return;
    }

    // If spam, mark LOW priority and prefix title — don't delete (employee can dismiss manually)
    const title = result.is_spam
      ? `[Spam] ${result.title}`
      : result.title;

    await prisma.todo.update({
      where: { id: instantTodo.id },
      data: { title, description: result.description, dueDate, priority: result.is_spam ? "LOW" : priority },
    });

    const todoId = instantTodo.id;
    console.log(`[AI] Enriched todo ${todoId}: "${title}" (${priority})`);

    await pusher.trigger(`private-${data.orgId}-todos`, "todo.updated", {
      todoId,
      title,
      priority,
      orgId: data.orgId,
    }).catch(() => {});
  }
}

export async function initMessageWorker() {
  const worker = new Worker(
    "messages",
    async (job) => {
      switch (job.data.type) {
        case "send_message":
          await sendMessage(job.data as SendMessageJob);
          break;
        case "process_message":
          await analyzeConversation(job.data as AnalyzeConversationJob);
          break;
        default:
          console.warn(`[Queue] Unknown job type: ${(job.data as any).type}`);
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed: ${err.message}`);
  });

  console.log("[Worker] Message worker initialized");
  return worker;
}

export async function enqueueMessageJob(data: WorkerJob) {
  await messageQueue.add(data.type, data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}
