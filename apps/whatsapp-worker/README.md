# WhatsApp Worker

Long-running Node.js service for WhatsApp session management and message processing.

- Maintains persistent WhatsApp sessions using whatsapp-web.js + Postgres auth
- Listens for incoming messages and pushes to queue
- Processes outbound messages with rate limiting
- Extracts todos via Claude API

See: [agent_docs/whatsapp-worker.md](../../agent_docs/whatsapp-worker.md)
