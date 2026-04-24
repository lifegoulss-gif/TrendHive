import { createClient, type RedisClientType } from "redis";

const redisConfig = {
  url: process.env.UPSTASH_URL || "redis://localhost:6379",
  password: process.env.UPSTASH_TOKEN || undefined,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redis: RedisClientType<any, any, any> = createClient(redisConfig) as any;

redis.on("error", (err) => console.error("[Redis] Error:", err));
redis.on("connect", () => console.log("[Redis] Connected"));

export default redis;

// Separate subscriber client (can't reuse the same connection for pub/sub)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _subscriber: RedisClientType<any, any, any> | null = null;

export async function getSubscriber(): Promise<RedisClientType<any, any, any>> {
  if (!_subscriber) {
    _subscriber = createClient(redisConfig);
    _subscriber.on("error", (err) => console.error("[Redis Sub] Error:", err));
    await _subscriber.connect();
  }
  return _subscriber;
}
