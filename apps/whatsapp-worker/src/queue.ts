import { Worker, Queue } from "bullmq";
import { prisma } from "@repo/database";
import { AsyncLocalStorage } from "async_hooks";
import { v4 as uuid } from "crypto";
import redis from "./redis";

/**
 * Global queue reference for job enqueueing from web app
 */
export const messageQueue = new Queue("messages", { connection: redis });

/**
 * Job types processed by worker
 */
export interface SendMessageJob {
  type: "send_message";
  sessionId: string;
  to: string;
  text: string;
}

export interface ProcessMessageJob {
  type: "process_message";
  messageId: string;
}

export type WorkerJob = SendMessageJob | ProcessMessageJob;

/**
 * Initialize message worker
 * Listens for jobs in BullMQ queue and processes them
 */
export async function initMessageWorker() {
  const worker = new Worker(
    "messages",
    async (job) => {
      console.log(`[Worker] Processing job ${job.id}:`, job.name);

      try {
        switch (job.data.type) {
          case "send_message":
            // TODO: sendMessage(job.data);
            break;
          case "process_message":
            // TODO: processMessage(job.data);
            break;
        }
      } catch (error) {
        console.error(`[Worker] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    { connection: redis }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} permanently failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  console.log("[Worker] Message worker initialized");

  return worker;
}

/**
 * Enqueue a message job from the web app
 */
export async function enqueueMessageJob(
  data: SendMessageJob | ProcessMessageJob
) {
  await messageQueue.add(data.type, data, {
    removeOnComplete: true,
    removeOnFailed: false,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
}
