# Multi-Tenancy Rules

Read this before writing ANY Prisma query, tRPC procedure, or API route that touches org-scoped data.

## The core invariant

Every row in `Message`, `Todo`, `Contact`, `WhatsAppSession`, and `User` belongs to exactly one `Organization`. Leaking data between orgs is the worst possible bug in this product — it ends the business.

## The rule

**Every query involving an org-scoped table MUST filter by `orgId`.**

No exceptions. No "just this once." If you're tempted to skip it because "this endpoint is admin-only," the answer is still no — admins belong to orgs too.

## Getting orgId

### In tRPC procedures

Use the `orgProcedure` helper, not `protectedProcedure`. It injects `ctx.orgId` from the authenticated user's active org (Clerk org → synced User.orgId).

```ts
// ✅ Correct
export const todoRouter = createTRPCRouter({
  list: orgProcedure.query(({ ctx }) =>
    ctx.db.todo.findMany({ where: { orgId: ctx.orgId } })
  ),
});

// ❌ Wrong — no org filter
export const todoRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.todo.findMany()  // returns EVERYONE's todos
  ),
});
```

### In webhooks / background jobs

`orgId` must come from the job payload, not from a global. BullMQ jobs always carry `{ orgId, ...rest }` in their data.

```ts
// ✅ Correct
worker.process(async (job) => {
  const { orgId, messageId } = job.data;
  await db.message.findFirst({ where: { id: messageId, orgId } });
});
```

## Enforcement layers

We have THREE layers of defense. Use all of them.

### 1. Application layer (primary)

Every query filters by `orgId` manually. This is the main defense.

### 2. Prisma extension (backup)

`packages/database/src/extensions/org-guard.ts` extends the Prisma client. On `findMany`/`findFirst`/`findUnique`/`update`/`delete` against org-scoped models, it throws if `where.orgId` is missing.

Enabled in dev and test. Disabled in prod for performance, but the checks run in CI.

### 3. Postgres Row-Level Security (eventual)

When we have >10 paying customers, enable RLS policies that enforce `orgId = current_setting('app.current_org_id')`. Set the setting at the start of every request in the tRPC context.

Not in place yet — don't rely on it. App-level filtering is still required.

## Common mistakes

### Forgetting on `update`/`delete`

```ts
// ❌ Dangerous — lets one org update another org's todo
await db.todo.update({ where: { id: todoId }, data: { status: 'DONE' } });

// ✅ Safe
await db.todo.update({ where: { id: todoId, orgId: ctx.orgId }, data: { status: 'DONE' } });
```

Composite where clauses require the `@@unique` index. Our schema has these on every org-scoped model — don't remove them.

### Leaking via relations

```ts
// ❌ If session belongs to a different org, this still finds it
await db.message.findMany({ where: { sessionId: someSessionId } });

// ✅
await db.message.findMany({ where: { sessionId: someSessionId, orgId: ctx.orgId } });
```

### Pusher channels

Private channels MUST be named `{orgId}-{channel}` and authenticated at `/api/pusher/auth` by verifying the user belongs to that org. Never use just `{sessionId}` as the channel name — session IDs are opaque cuids but not secret.

## Testing

Every org-scoped feature MUST have a "cross-tenant isolation" test:

```ts
test('user from org A cannot read todos from org B', async () => {
  const { userA, orgA } = await createOrgWithUser();
  const { orgB } = await createOrgWithUser();
  const todoInB = await db.todo.create({ data: { orgId: orgB.id, ... } });

  const caller = createCaller({ userId: userA.id, orgId: orgA.id });
  const result = await caller.todo.getById({ id: todoInB.id });

  expect(result).toBeNull();  // NOT thrown, just invisible
});
```

These tests live in `apps/web/src/server/__tests__/tenancy.test.ts`. Don't merge a PR that adds an org-scoped feature without one.

## Roles inside an org

Multi-tenancy is org-level. Within an org, role-based access (OWNER/MANAGER/EMPLOYEE) is a separate concern — see `agent_docs/auth-and-roles.md`.
