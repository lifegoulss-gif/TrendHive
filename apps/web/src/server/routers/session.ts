import { prisma } from "@repo/database";
import { SessionStatusSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router, requireRole } from "../trpc";

/**
 * WhatsApp session router - connect, list, disconnect
 */
export const sessionRouter = router({
  /**
   * List all sessions for organization
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.whatsAppSession.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * Get single session details
   */
  getById: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input: sessionId }) => {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: {
          messages: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!session || session.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      return session;
    }),

  /**
   * Initiate new WhatsApp session (after consent screen)
   * Worker will handle QR code generation
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await prisma.whatsAppSession.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          status: "CONNECTING",
        },
      });

      // TODO: Signal worker to initialize session + generate QR

      return session;
    }),

  /**
   * Disconnect session
   */
  disconnect: protectedProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input: sessionId }) => {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session not accessible",
        });
      }

      // TODO: Signal worker to gracefully disconnect

      return prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: "DISCONNECTED" },
      });
    }),
});
