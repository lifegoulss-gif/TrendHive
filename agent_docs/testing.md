# Testing Strategy

Write tests for the hard parts: **data access patterns, multi-tenancy, auth, edge cases**. Skip trivial getters and UI rendering tests.

## Test Stack

- **vitest** — fast unit + integration tests (Vite-based)
- **@testing-library/react** — component testing (if UI complexity warrants)
- **@prisma/client** — database queries with test database

## Test Database Setup

Create `packages/database/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    globals: true,
  },
});
```

Create `packages/database/src/__tests__/setup.ts`:

```typescript
import { prisma } from "../index";

// Reset DB before each test
beforeEach(async () => {
  // Delete in correct order to avoid FK errors
  await prisma.todo.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.whatsAppSession.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

## Multi-Tenancy Tests (Critical)

Every query MUST filter by orgId. Write tests that verify this:

```typescript
// packages/database/src/__tests__/multi-tenancy.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../index";

describe("Multi-Tenancy", () => {
  it("should not leak messages between orgs", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: "org-1" },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: "org-2" },
    });

    const session1 = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    const msg = await prisma.message.create({
      data: {
        orgId: org1.id,
        sessionId: session1.id,
        from: "+1111111111",
        to: "+2222222222",
        text: "secret",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    // Query org2's messages
    const org2Messages = await prisma.message.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Messages).toHaveLength(0); // ✅ Must not leak
    expect(org2Messages).not.toContainEqual(msg);
  });

  it("should filter todos by orgId", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({ data: { name: "Org 1", slug: "org-1" } }),
      prisma.organization.create({ data: { name: "Org 2", slug: "org-2" } }),
    ]);

    // Create message + todo in org1
    const session = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    const msg = await prisma.message.create({
      data: {
        orgId: org1.id,
        sessionId: session.id,
        from: "+1111111111",
        to: "+2222222222",
        text: "hello",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const todo = await prisma.todo.create({
      data: {
        orgId: org1.id,
        messageId: msg.id,
        title: "Secret todo",
      },
    });

    // Query org2's todos
    const org2Todos = await prisma.todo.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Todos).toHaveLength(0); // ✅ No leak
  });
});
```

## tRPC Router Tests

```typescript
// apps/web/src/server/__tests__/routers.test.ts
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers/_app";

describe("tRPC routers", () => {
  it("should require auth", async () => {
    const caller = appRouter.createCaller({ user: null, orgId: null });

    await expect(caller.message.list()).rejects.toThrow("UNAUTHORIZED");
  });

  it("should filter messages by orgId", async () => {
    // Setup
    const org = await prisma.organization.create({
      data: { name: "Test", slug: "test" },
    });

    const user = await prisma.user.create({
      data: {
        clerkId: "user_1",
        email: "test@example.com",
        orgId: org.id,
        role: "OWNER",
      },
    });

    // Create message in org
    const session = await prisma.whatsAppSession.create({
      data: { orgId: org.id, phoneNumber: "+1111111111" },
    });

    await prisma.message.create({
      data: {
        orgId: org.id,
        sessionId: session.id,
        from: "+1",
        to: "+2",
        text: "msg",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    // Query as this user
    const caller = appRouter.createCaller({
      user: { id: user.id, orgId: org.id, role: "OWNER" },
      orgId: org.id,
    });

    const messages = await caller.message.list();
    expect(messages).toHaveLength(1);
  });

  it("should reject cross-org access", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({ data: { name: "Org 1", slug: "org-1" } }),
      prisma.organization.create({ data: { name: "Org 2", slug: "org-2" } }),
    ]);

    const user2 = await prisma.user.create({
      data: {
        clerkId: "user_2",
        email: "test2@example.com",
        orgId: org2.id,
        role: "OWNER",
      },
    });

    // User from org2 tries to access org1
    const caller = appRouter.createCaller({
      user: { id: user2.id, orgId: org2.id, role: "OWNER" },
      orgId: org2.id, // orgId from context should protect
    });

    // Even if they know the query, context.orgId filters them out
    const messages = await caller.message.list();
    expect(messages).toHaveLength(0);
  });
});
```

## AI/Todo Extraction Tests

```typescript
// apps/whatsapp-worker/src/__tests__/ai.test.ts
describe("AI todo extraction", () => {
  it("should extract todos from OUTBOUND messages", async () => {
    const result = await extractTodos(
      {
        id: "msg_1",
        orgId: "org_1",
        text: "Please call me tomorrow at 2pm and send invoice",
        direction: "OUTBOUND",
        aiProcessed: false,
      },
      // Mock Claude API here
    );

    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("call");
    expect(result[1].title).toContain("invoice");
  });

  it("should not extract from INBOUND messages", async () => {
    const result = await extractTodos(
      {
        id: "msg_2",
        orgId: "org_1",
        text: "Can you call me?",
        direction: "INBOUND",
        aiProcessed: false,
      },
    );

    expect(result).toHaveLength(0); // ✅ Cost control
  });

  it("should skip short messages", async () => {
    const result = await extractTodos(
      {
        id: "msg_3",
        orgId: "org_1",
        text: "ok", // < 10 chars
        direction: "OUTBOUND",
        aiProcessed: false,
      },
    );

    expect(result).toHaveLength(0);
  });
});
```

## Rate Limiting Tests

```typescript
// apps/whatsapp-worker/src/__tests__/rate-limiter.test.ts
describe("Rate limiter", () => {
  it("should allow 1 message per second", async () => {
    const limiter = new RateLimiter();

    expect(limiter.tryConsume(1)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false); // Blocked

    await delay(1000);
    expect(limiter.tryConsume(1)).toBe(true); // Allowed after wait
  });

  it("should retry with exponential backoff on WA send failure", async () => {
    const spy = vi.spyOn(client, "sendMessage");
    spy.mockRejectedValueOnce(new Error("Network"));

    const backoff = exponentialBackoff(0);
    expect(backoff).toBe(100); // ms

    expect(exponentialBackoff(1)).toBe(200);
    expect(exponentialBackoff(2)).toBe(400);
  });
});
```

## Run Tests

```bash
# All tests
pnpm test

# Watch mode (during development)
pnpm test:watch

# Single file
pnpm test -- multi-tenancy.test.ts

# Coverage (optional)
pnpm test -- --coverage
```

## What NOT to Test

- **UI snapshots** — too brittle, low signal
- **Trivial getters** — e.g., `return this.id`
- **External APIs** — mock them instead (Clerk, Stripe, Claude)
- **Prisma internals** — trust Prisma's tests

## What to Test

- **Data access patterns** — orgId filtering, joins, pagination
- **Multi-tenancy violations** — critical correctness
- **Auth middleware** — role checks, token validation
- **Business logic** — todo extraction rules, rate limiting
- **Error cases** — network failures, validation

---

## See Also

- [Vitest Docs](https://vitest.dev)
- [Testing Library Docs](https://testing-library.com)
