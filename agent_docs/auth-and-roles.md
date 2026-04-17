# Authentication & Authorization

Clerk handles identity (sign-up, passwords, MFA). Postgres `User` table is the source of truth for roles and org membership.

## Clerk → Postgres Sync

The webhook at `apps/web/app/api/webhooks/clerk/route.ts` **synchronously** keeps both in sync.

### Webhook Flow

```
1. User signs up in Clerk
2. Clerk fires user.created event
3. POST /api/webhooks/clerk
   ├─ Verify signature (critical: use raw body)
   ├─ Create Postgres User record
   │  - clerkId := event.data.id
   │  - email := event.data.email_addresses[0].email_address
   │  - orgId := derive from invitation or use default
   │  - role := EMPLOYEE (or OWNER if first user)
   └─ Return 200 OK

4. User logs in
5. Next.js useAuth() hook reads Clerk session
6. tRPC middleware fetches User from Postgres (source of truth)
7. orgId injected into ctx
```

### Webhook Implementation

```typescript
// apps/web/app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import { prisma } from "@repo/database";

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  // ⚠️ Use req.text(), NOT req.json()
  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let evt;
  try {
    evt = wh.verify(body, req.headers.get("svix-signature") || "");
  } catch (err) {
    return new Response("Webhook signature invalid", { status: 401 });
  }

  switch (evt.type) {
    case "user.created":
      await prisma.user.create({
        data: {
          clerkId: evt.data.id,
          email: evt.data.email_addresses[0].email_address,
          name: evt.data.first_name || undefined,
          org: { create: { name: "My Org", slug: cuid() } },
          role: "OWNER",
        },
      });
      break;

    case "user.deleted":
      // Cascade delete handled by schema
      await prisma.user.deleteMany({
        where: { clerkId: evt.data.id },
      });
      break;
  }

  return new Response();
}
```

**Critical:** This route does NOT use `getAuth()` — it runs before user context exists.

## Roles & Permissions

```
OWNER
├─ View all org data
├─ Invite/remove members
├─ Change member roles
├─ Update billing
└─ Delete org

MANAGER
├─ View team messages + todos
├─ Manage sessions (connect/disconnect)
├─ View analytics
└─ Cannot: billing, member management

EMPLOYEE
├─ View own sent messages
├─ View todos extracted from conversations
├─ Connect own WA session (consent required)
└─ Cannot: see other employees' chats, analytics, billing
```

## tRPC Middleware for Protection

```typescript
// apps/web/server/trpc.ts
import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@repo/database";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const auth = getAuth(opts.headers);

  if (!auth.userId) {
    return { user: null, orgId: null };
  }

  // Query Postgres for role + org
  const user = await prisma.user.findUnique({
    where: { clerkId: auth.userId },
    select: { orgId: true, role: true, id: true },
  });

  if (!user) {
    throw new Error("User not found in database");
  }

  return { user, orgId: user.orgId };
};

const t = initTRPC.context<typeof createTRPCContext>().create();

// Base procedures
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, orgId: ctx.user.orgId, userId: ctx.user.id } });
});

// Role-gated procedures
export const requireRole = (role: Role) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (!roleAllows(ctx.user.role, role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });
```

### Usage in Routers

```typescript
// ✅ Anyone signed in can list their org's messages
export const messageRouter = t.router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.message.findMany({
      where: { orgId: ctx.orgId }, // ← orgId from context
    });
  }),

  // ✅ Only managers+ can bulk-delete
  deleteMany: requireRole("MANAGER")
    .input(z.object({ ids: z.array(z.string().cuid()) }))
    .mutation(async ({ ctx, input }) => {
      return prisma.message.deleteMany({
        where: { id: { in: input.ids }, orgId: ctx.orgId }, // ← doubly-safe
      });
    }),
});
```

## Session Lifecycle in Middleware

```typescript
// In component / API route
import { useAuth } from "@clerk/nextjs";

export function Dashboard() {
  const { userId } = useAuth();
  const { data: user } = trpc.auth.me.useQuery();
  // Returns Postgres User + role
  // Safe to check user.role here

  if (user?.role !== "OWNER") {
    return <AccessDenied />;
  }
}
```

## Inviting Members

```typescript
// tRPC mutation
export const memberRouter = t.router({
  invite: requireRole("OWNER")
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      // Send invite via Clerk's APIs or Resend
      // When user signs up with that email, webhook auto-adds to org
      return { success: true };
    }),
});
```

## Verifying Org Membership

Always query the Postgres User table to double-check the org assignment:

```typescript
// ❌ WRONG - trusts only Clerk
const userId = auth.userId;

// ✅ CORRECT - verifies Postgres
const user = await prisma.user.findUnique({
  where: { clerkId: auth.userId },
  select: { orgId: true, role: true },
});

if (!user) {
  throw new Error("User not in database");
}

if (user.orgId !== requestedOrgId) {
  throw new TRPCError({ code: "FORBIDDEN" });
}
```

## Security Checklist

- [ ] Webhook uses raw body for signature verification
- [ ] All tRPC procedures use `protectedProcedure` or `requireRole`
- [ ] Every DB query filters by `orgId` from context
- [ ] No SQL in user input (ORM + Prisma only)
- [ ] Clerk webhook secret never logged or exposed
- [ ] Role checks happen after org membership verify
- [ ] Session data not stored in JWTs (fetch from DB each time)

---

## See Also

- [multi-tenancy.md](multi-tenancy.md) — orgId enforcement
- [Clerk Docs](https://clerk.com/docs) — authentication reference
- [tRPC Server Docs](https://trpc.io/docs/server/context) — context & middleware
