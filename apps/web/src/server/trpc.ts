import { getAuth } from "@clerk/nextjs/server";
import { prisma } from "@repo/database";
import { TRPCError, initTRPC } from "@trpc/server";
import { NextRequest } from "next/server";

/**
 * Create tRPC context from request headers
 * Ensures orgId is injected and multi-tenancy is enforced
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
}) => {
  const auth = getAuth(opts.headers as any);

  let user = null;
  let orgId = null;

  if (auth.userId) {
    user = await prisma.user.findUnique({
      where: { clerkId: auth.userId },
      select: { id: true, orgId: true, role: true, email: true },
    });

    if (!user) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "User not found in database",
      });
    }

    orgId = user.orgId;
  }

  return { user, orgId };
};

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();

/**
 * Public procedure - no auth required
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authentication + valid orgId
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      orgId: ctx.orgId,
    },
  });
});

/**
 * Role-gated procedure factory
 */
export const requireRole = (requiredRole: "OWNER" | "MANAGER" | "EMPLOYEE") =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const roleHierarchy = { OWNER: 3, MANAGER: 2, EMPLOYEE: 1 };
    if (
      roleHierarchy[ctx.user.role] < roleHierarchy[requiredRole]
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });

export const router = t.router;
export const middleware = t.middleware;
