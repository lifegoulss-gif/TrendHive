import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

/**
 * Todo router - list, mark complete, delete
 */
export const todoRouter = router({
  /**
   * List todos for organization
   */
  list: protectedProcedure
    .input(
      z.object({
        completed: z.boolean().optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return prisma.todo.findMany({
        where: {
          orgId: ctx.orgId,
          completed: input.completed,
          priority: input.priority,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        include: { message: true },
      });
    }),

  /**
   * Mark todo as complete
   */
  complete: protectedProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input: todoId }) => {
      const todo = await prisma.todo.findUnique({
        where: { id: todoId },
      });

      if (!todo || todo.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Todo not found or not accessible",
        });
      }

      return prisma.todo.update({
        where: { id: todoId },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      });
    }),

  /**
   * Delete todo
   */
  delete: protectedProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input: todoId }) => {
      const todo = await prisma.todo.findUnique({
        where: { id: todoId },
      });

      if (!todo || todo.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Todo not found or not accessible",
        });
      }

      return prisma.todo.delete({
        where: { id: todoId },
      });
    }),
});
