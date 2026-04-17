import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

/**
 * Organization router - org info, members, settings
 */
export const orgRouter = router({
  /**
   * Get current user's organization
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      include: {
        members: {
          select: { id: true, email: true, name: true, role: true },
        },
        subscription: true,
      },
    });

    if (!org) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    return org;
  }),

  /**
   * List organization members
   */
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }),
});
