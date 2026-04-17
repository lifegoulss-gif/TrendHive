import { createClient } from "redis";

/**
 * Global Redis client for BullMQ queue
 */
const redis = createClient({
  url: process.env.UPSTASH_URL || "redis://localhost:6379",
  password: process.env.UPSTASH_TOKEN,
});

redis.on("error", (err) => {
  console.error("[Redis] Error:", err);
});

redis.on("connect", () => {
  console.log("[Redis] Connected to Upstash");
});

export default redis;
