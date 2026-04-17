# WhatsApp Worker — Deep Dive

Read this before touching anything in `apps/whatsapp-worker`.

## Why it's a separate service

Next.js API routes are stateless and short-lived. `whatsapp-web.js` needs a long-running process holding an in-memory browser session per phone number. The worker runs as a long-lived container on Fly.io (or Railway).

Web ↔ Worker talk over:
- **Redis pub/sub** for outbound commands (send message, disconnect session, etc.)
- **HTTP POST to web** for inbound events (new message, session status change) at `/api/webhooks/worker`
- **Pusher** for realtime updates to the browser UI

## Session lifecycle

1. User clicks "Connect WhatsApp" → web calls `tRPC.whatsapp.createSession`
2. tRPC publishes `session:start` on Redis with `{ sessionId, orgId, employeeId }`
3. Worker picks up job, creates a `whatsapp-web.js` Client with `PostgresAuth` strategy
4. Client emits `qr` event → worker pushes QR to Pusher channel `session-{sessionId}`
5. User scans QR → Client emits `ready` → worker updates `WhatsAppSession.status = CONNECTED`
6. Client emits `message` / `message_create` → worker writes to DB, notifies web, enqueues AI job

## The auth persistence gotcha

**`LocalAuth` writes to disk. Fly/Railway filesystems are ephemeral. Every deploy or restart = all sessions need re-scanning. Users will rage-quit.**

Solution: custom `AuthStrategy` that reads/writes session blobs to Postgres (encrypted).

See implementation in `apps/whatsapp-worker/src/sessions/postgres-auth.ts`. It extends `BaseAuthStrategy` and overrides:
- `beforeBrowserInitialized()` — hydrate userDataDir from DB
- `afterAuthReady()` — dump userDataDir back to DB, encrypt with `SESSION_ENCRYPTION_KEY`
- `logout()` — clear DB row

## Rate limiting

Outbound: max 1 msg/sec per session. Inbound: no limit (we're just receiving).

The limiter is a per-session `p-queue` instance with `{ interval: 1000, intervalCap: 1 }`. On send error, mark session `status = THROTTLED` for 60s before retrying.

**Why:** WhatsApp's anti-spam ML looks at send velocity. Burst-sending will get the number banned. A banned customer number is a refund request.

## Message pipeline

```
WhatsApp → whatsapp-web.js client → worker listener
  ↓
  Deduplicate by waMessageId (client can fire twice)
  ↓
  Upsert Contact (find or create by phone number)
  ↓
  Insert Message row
  ↓
  Notify web via Pusher (realtime Unibox update)
  ↓
  Enqueue 'analyze-conversation' job in BullMQ (debounced 30s)
```

Debouncing: we queue `analyze:{sessionId}:{contactId}` with a 30s delay. If another message in the same conversation arrives, we replace the job. This batches AI analysis per conversation instead of per-message. See `agent_docs/ai-todo-detection.md`.

## Listeners MUST be registered before `initialize()`

`whatsapp-web.js` silently drops events emitted during initialization if no listener is attached. Order:

```ts
const client = new Client({ authStrategy: new PostgresAuth(sessionId) });
client.on('qr', handleQr);
client.on('ready', handleReady);
client.on('message', handleInbound);
client.on('message_create', handleOutbound);  // for messages sent from phone
client.on('disconnected', handleDisconnect);
await client.initialize();  // LAST
```

## Graceful shutdown

SIGTERM from Fly → destroy all active clients (`client.destroy()`), flush BullMQ queues, close Redis. Give it 30s grace period in `fly.toml`.

## Testing without burning numbers

`pnpm worker:sandbox` boots a session against a dev phone that's registered in `SANDBOX_NUMBERS` env var. It mocks the AI call (returns a fake to-do) so you can test end-to-end without API spend.

For unit tests: mock `whatsapp-web.js` entirely. We have a fake client factory in `apps/whatsapp-worker/src/testing/fake-client.ts`.

## Banned-number recovery

If Client emits `auth_failure` or repeated `disconnected` with reason `CONFLICT` / `UNPAIRED`, mark `WhatsAppSession.status = BANNED` and notify the org owner via email. Do NOT auto-reconnect — that spams WhatsApp and can get the IP blocked.
