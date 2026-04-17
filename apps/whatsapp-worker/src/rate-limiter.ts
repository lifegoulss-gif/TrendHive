/**
 * Rate limiter for WhatsApp messages
 * Enforces 1 message per second per session to avoid getting banned
 */

interface RateLimitBucket {
  tokens: number;
  lastRefillAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const TOKENS_PER_SECOND = 1;
const MAX_BURST = 5; // Allow bursts up to 5 messages

/**
 * Try to consume a token.
 * Returns true if allowed, false if rate limited
 */
export function tryConsumeToken(sessionId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(sessionId) || {
    tokens: MAX_BURST,
    lastRefillAt: now,
  };

  // Refill tokens based on elapsed time
  const elapsedSeconds =
    (now - bucket.lastRefillAt) / 1000;
  bucket.tokens = Math.min(
    MAX_BURST,
    bucket.tokens + elapsedSeconds * TOKENS_PER_SECOND
  );
  bucket.lastRefillAt = now;

  // Try to consume
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(sessionId, bucket);
    return true;
  }

  return false;
}

/**
 * Get estimated wait time in ms until next message is allowed
 */
export function getWaitTime(sessionId: string): number {
  const bucket = buckets.get(sessionId);
  if (!bucket) return 0;

  if (bucket.tokens >= 1) return 0;

  // Wait time = time needed to generate 1 token
  return Math.ceil((1 - bucket.tokens) / TOKENS_PER_SECOND * 1000);
}

/**
 * Reset rate limit for a session (e.g., on disconnect)
 */
export function resetRateLimit(sessionId: string) {
  buckets.delete(sessionId);
}

/**
 * Exponential backoff calculator for retries
 */
export function getExponentialBackoff(attemptNumber: number): number {
  const maxDelay = 30000; // 30 seconds max
  const delay = Math.min(Math.pow(2, attemptNumber) * 100, maxDelay);
  return delay + Math.random() * 1000; // Add jitter
}
