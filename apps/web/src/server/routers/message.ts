import { prisma } from "@repo/database";
import { MessageDirectionSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

/**
 * Message router - list, send, mark AI processed
 */
export const messageRouter = router({
  /**
   * List messages for organization (paginated)
   */
  list: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().cuid().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.pageSize;

      const messages = await prisma.message.findMany({
        where: {
          orgId: ctx.orgId,
          sessionId: input.sessionId,
        },
        skip,
        take: input.pageSize,
        orderBy: { createdAt: "desc" },
        include: { todos: true },
      });

      const total = await prisma.message.count({
        where: {
          orgId: ctx.orgId,
          sessionId: input.sessionId,
        },
      });

      return {
        messages,
        total,
        page: input.page,
        pageSize: input.pageSize,
        pageCount: Math.ceil(total / input.pageSize),
      };
    }),

  /**
   * Get single message with todos
   */
  getById: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input: messageId }) => {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { todos: true },
      });

      if (!message || message.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found",
        });
      }

      return message;
    }),

  /**
   * Send outbound message to WhatsApp number
   * (Enqueues job for worker)
   */
  send: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().cuid(),
        to: z.string(),
        text: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify session belongs to org
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!session || session.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Session not accessible",
        });
      }

      // Create message record
      const message = await prisma.message.create({
        data: {
          orgId: ctx.orgId,
          sessionId: input.sessionId,
          from: session.phoneNumber || "unknown",
          to: input.to,
          text: input.text,
          direction: "OUTBOUND",
          timestamp: new Date(),
        },
      });

      // TODO: Enqueue sendMessage job to Redis

      return message;
    }),
});
