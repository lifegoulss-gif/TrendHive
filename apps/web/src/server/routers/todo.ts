import { type Prisma, prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../trpc";

const resend = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

async function sendOverdueAlert(
	adminEmail: string,
	orgName: string,
	overdueTodos: { title: string; createdAt: Date; priority: string }[],
) {
	if (!resend) return;
	const list = overdueTodos
		.map(
			(t) =>
				`• [${t.priority}] ${t.title} (created ${t.createdAt.toLocaleString()})`,
		)
		.join("\n");

	await resend.emails.send({
		from: "UniboxAI <alerts@yourdomain.com>",
		to: adminEmail,
		subject: `⚠️ ${overdueTodos.length} incomplete to-do${overdueTodos.length > 1 ? "s" : ""} — ${orgName}`,
		text: `Hi,\n\nThe following to-dos have not been completed:\n\n${list}\n\nPlease log in and review them at your earliest convenience.\n\n— UniboxAI`,
	});
}

/**
 * Todo router - list, mark complete, delete, admin alerts
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
			}),
		)
		.query(async ({ ctx, input }) => {
			const where: Prisma.TodoWhereInput = {
				orgId: ctx.orgId,
				completed: input.completed,
				priority: input.priority,
			};
			// Employees only see todos from their own WhatsApp session
			if (ctx.user.role === "EMPLOYEE") {
				where.message = { is: { session: { is: { userId: ctx.user.id } } } };
			}

			return prisma.todo.findMany({
				where,
				orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
				include: {
					message: {
						select: {
							from: true,
							to: true,
							direction: true,
							session: { select: { name: true, phoneNumber: true } },
						},
					},
				},
			});
		}),

	/**
	 * Get overdue/stale incomplete todos (older than given hours)
	 */
	getOverdue: protectedProcedure
		.input(z.object({ olderThanHours: z.number().default(4) }))
		.query(async ({ ctx, input }) => {
			const cutoff = new Date(
				Date.now() - input.olderThanHours * 60 * 60 * 1000,
			);
			const where: Prisma.TodoWhereInput = {
				orgId: ctx.orgId,
				completed: false,
				createdAt: { lt: cutoff },
			};
			if (ctx.user.role === "EMPLOYEE") {
				where.message = { is: { session: { is: { userId: ctx.user.id } } } };
			}
			return prisma.todo.findMany({
				where,
				orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
				include: {
					message: {
						select: {
							from: true,
							direction: true,
							session: { select: { name: true, phoneNumber: true } },
						},
					},
				},
			});
		}),

	/**
	 * Alert admin about incomplete todos older than N hours
	 * Called by worker cron or admin dashboard
	 */
	alertAdmin: protectedProcedure
		.input(z.object({ olderThanHours: z.number().default(4) }))
		.mutation(async ({ ctx, input }) => {
			const cutoff = new Date(
				Date.now() - input.olderThanHours * 60 * 60 * 1000,
			);

			const [overdueTodos, org, adminUser] = await Promise.all([
				prisma.todo.findMany({
					where: {
						orgId: ctx.orgId,
						completed: false,
						createdAt: { lt: cutoff },
					},
					select: { title: true, createdAt: true, priority: true },
					orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
				}),
				prisma.organization.findUnique({
					where: { id: ctx.orgId },
					select: { name: true },
				}),
				prisma.user.findFirst({
					where: { orgId: ctx.orgId, role: "OWNER" },
					select: { email: true },
				}),
			]);

			if (!overdueTodos.length) return { sent: false, count: 0 };
			if (!adminUser?.email) return { sent: false, count: 0 };

			await sendOverdueAlert(
				adminUser.email,
				org?.name ?? "Your Organisation",
				overdueTodos,
			);
			return { sent: true, count: overdueTodos.length };
		}),

	/**
	 * Mark todo as complete
	 */
	complete: protectedProcedure
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: todoId }) => {
			const todo = await prisma.todo.findUnique({ where: { id: todoId } });

			if (!todo || todo.orgId !== ctx.orgId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Todo not found or not accessible",
				});
			}

			return prisma.todo.update({
				where: { id: todoId },
				data: { completed: true, completedAt: new Date() },
			});
		}),

	/**
	 * Delete todo
	 */
	delete: protectedProcedure
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: todoId }) => {
			const todo = await prisma.todo.findUnique({ where: { id: todoId } });

			if (!todo || todo.orgId !== ctx.orgId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Todo not found or not accessible",
				});
			}

			return prisma.todo.delete({ where: { id: todoId } });
		}),

	/**
	 * MANAGER+ oversight: all org todos, cursor-paginated, with employee info.
	 * "missed" = incomplete with a past due date; "completed" = done.
	 */
	listForDashboard: requireRole("MANAGER")
		.input(
			z.object({
				status: z.enum(["missed", "completed"]),
				limit: z.number().min(1).max(100).default(50),
				cursor: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const now = new Date();
			const where: Prisma.TodoWhereInput = {
				orgId: ctx.orgId,
				...(input.status === "missed"
					? { completed: false, dueDate: { lt: now } }
					: { completed: true }),
			};

			const items = await prisma.todo.findMany({
				where,
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				orderBy:
					input.status === "missed"
						? { dueDate: "asc" }
						: { completedAt: "desc" },
				include: {
					message: {
						select: {
							from: true,
							to: true,
							direction: true,
							session: {
								select: {
									name: true,
									phoneNumber: true,
									user: {
										select: { id: true, name: true, email: true },
									},
								},
							},
						},
					},
				},
			});

			let nextCursor: string | undefined;
			if (items.length > input.limit) {
				nextCursor = items.pop()!.id;
			}

			return { items, nextCursor };
		}),
});
