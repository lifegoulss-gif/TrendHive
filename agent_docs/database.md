# Database Schema & Prisma

The Prisma schema lives in `packages/database/prisma/schema.prisma`. It's the single source of truth for all data models. Never regenerate the client from other locations—always import `@repo/database`.

## Schema Rationale

### Organizations & Users (Multi-Tenancy Boundaries)

```prisma
model Organization {
  id String @id @default(cuid())
  slug String @unique
  members User[]
  sessions WhatsAppSession[]
  messages Message[]
  todos Todo[]
}

model User {
  orgId String
  role Role @default(EMPLOYEE)
}

enum Role { OWNER, MANAGER, EMPLOYEE }
```

**Why CUIDs?** K-sortable, generation on client or server, no DB roundtrips.

**Multi-tenancy rule:** Every query must filter by `orgId`. See [multi-tenancy.md](multi-tenancy.md).

### WhatsApp Sessions

```prisma
model WhatsAppSession {
  orgId String
  phoneNumber String? // E164: +1234567890
  status SessionStatus @default(DISCONNECTED)
  authData Json? // Persisted LocalAuth credentials
  messages Message[]
}

enum SessionStatus { CONNECTING, CONNECTED, DISCONNECTED, ERROR }
```

**Indexes:**
- `(orgId, phoneNumber)` unique — prevents duplicate sessions per number
- `(orgId, status)` — fast "list active sessions" queries

**authData:** Encrypted at-rest by Supabase. Contains serialized browser session for `LocalAuth` persistence across container restarts.

### Messages

```prisma
model Message {
  orgId String
  sessionId String
  from String        // Phone number
  to String          // Phone number
  text String
  direction MessageDirection
  mediaUrl String?
  mediaType MediaType?
  aiProcessed Boolean @default(false)
  todos Todo[]
  wamId String? @unique   // WhatsApp's native message ID
  timestamp DateTime      // When WA sent it
}

enum MessageDirection { INBOUND, OUTBOUND }
enum MediaType { IMAGE, AUDIO, VIDEO, DOCUMENT }
```

**Indexes:**
- `(orgId)` — org message history
- `(sessionId)` — session message thread
- `(from, to)` — conversation thread detection
- `(aiProcessed)` — find messages needing AI extraction
- `(createdAt)` — recent messages for dashboard feed

**Constraints:**
- `aiProcessed` starts false; set to true after Claude extraction (or on error)
- Only OUTBOUND messages are passed to Claude (cost control)
- Message text must be ≥ 10 chars to trigger AI

### Todos (AI-Extracted)

```prisma
model Todo {
  orgId String
  messageId String @relation
  title String
  description String?
  dueDate DateTime?
  priority Priority @default(NORMAL)
  completed Boolean @default(false)
  completedAt DateTime?
}

enum Priority { LOW, NORMAL, HIGH, URGENT }
```

**Indexes:**
- `(orgId, completed)` — list pending todos for org
- `(messageId)` — find todos for a message

**Constraint:** One message can yield multiple todos (batch extraction).

### Subscriptions (Billing)

```prisma
model Subscription {
  orgId String @unique
  status SubscriptionStatus
  messageLimit Int         // e.g., 10,000 per month
  messageUsage Int         // Running count, reset monthly
  currentPeriodStart DateTime?
  currentPeriodEnd DateTime?
}

enum SubscriptionStatus { TRIALING, ACTIVE, PAST_DUE, CANCELED, PAUSED }
```

**Stripe sync:** Created by webhook, updated via Stripe API calls.

**Usage tracking:**
- Increment `messageUsage` every message
- At period end, reset to 0
- Check limit before accepting new messages

## Migration Workflow

### Development (local)

```bash
# After schema change:
pnpm db:push

# Review generated migration:
pnpm db:migrate

# Open Prisma Studio:
pnpm db:studio
```

### Production

```bash
# Create migration on dev machine:
pnpm db:migrate --name "add_field_description"

# Git commit migration file + schema
git add prisma/

# Deploy: Vercel / Fly will run:
# pnpm db:push --skip-generate
```

**Never** run `prisma db push` in production. Always use migrations (`prisma migrate deploy`).

## Querying Patterns

### Always Get Prisma from @repo/database

```typescript
// ✅ CORRECT
import { prisma } from "@repo/database";

const messages = await prisma.message.findMany({
  where: { orgId },
});
```

```typescript
// ❌ WRONG (creates duplicate client, pools grow)
import { PrismaClient } from "@prisma/client";
const client = new PrismaClient();
```

### Transactions for Multi-Table Updates

```typescript
// Send message + create Job, atomically
await prisma.$transaction(
  async (tx) => {
    const msg = await tx.message.create({
      data: { orgId, from, to, text, direction: "OUTBOUND" },
    });

    await tx.todo.create({
      data: {
        orgId,
        messageId: msg.id,
        title: "...",
      },
    });

    return msg;
  },
  { timeout: 15000 } // Worker needs longer than default 5s
);
```

### Pagination

```typescript
const page = parseInt(query.page) || 1;
const pageSize = 50;

const messages = await prisma.message.findMany({
  where: { orgId },
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: "desc" },
});
```

### Joins Between Tables

```typescript
const session = await prisma.whatsAppSession.findUnique({
  where: { id: sessionId },
  include: {
    org: true, // Load org data
    messages: {
      take: 10,
      orderBy: { createdAt: "desc" },
    },
  },
});
```

## Cost & Performance Notes

1. **N+1 queries:** Use `include` or `select` to batch fetches
2. **Indexes:** Check `agent_docs/database.md` for index strategy per table
3. **Connection pooling:** Supabase PgBouncer handles this; Prisma gets ~20 connections
4. **Long transactions:** Set `{ timeout: 15000 }` for worker jobs
5. **Scanning large tables:** Always filter by indexed columns first (orgId, sessionId, createdAt)

## Seeding (Optional)

For local testing, create `packages/database/prisma/seed.ts`:

```typescript
import { prisma } from "../src";

async function main() {
  const org = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: "test-org",
      members: {
        create: {
          clerkId: "test-user",
          email: "test@example.com",
          role: "OWNER",
        },
      },
    },
  });
}

main();
```

Run: `pnpm prisma db seed`

---

## See Also

- [multi-tenancy.md](multi-tenancy.md) — orgId enforcement rules
- [whatsapp-worker.md](whatsapp-worker.md) — message creation flow
- [Prisma Docs](https://www.prisma.io/docs) — official reference
