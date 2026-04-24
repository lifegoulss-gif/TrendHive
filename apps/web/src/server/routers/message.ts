import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { enqueueMessageJob } from "../lib/queue";
import { protectedProcedure, router } from "../trpc";

function formatPhone(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	return `+${digits}`;
}

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
			}),
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
	 * Server-side grouped conversations for the messages page
	 * Much faster than loading 200 raw messages and grouping client-side
	 */
	conversations: protectedProcedure
		.input(z.object({ sessionId: z.string().cuid().optional() }))
		.query(async ({ ctx, input }) => {
			// Get the 50 most recently active conversations by finding the latest message per contact
			const recentMessages = await prisma.message.findMany({
				where: { orgId: ctx.orgId, sessionId: input.sessionId },
				orderBy: { timestamp: "desc" },
				take: 500,
				select: {
					id: true,
					from: true,
					to: true,
					direction: true,
					text: true,
					timestamp: true,
					sessionId: true,
					todos: {
						select: {
							id: true,
							title: true,
							priority: true,
							dueDate: true,
							completed: true,
						},
					},
				},
			});

			// Group by contact phone server-side
			const convMap = new Map<
				string,
				{
					contactPhone: string;
					lastMessage: string;
					lastTimestamp: Date;
					sessionId: string;
					latestTodo: {
						id: string;
						title: string;
						priority: string;
						dueDate: Date | null;
						completed: boolean;
					} | null;
					unreadCount: number;
				}
			>();

			for (const msg of recentMessages) {
				const contactPhone = msg.direction === "INBOUND" ? msg.from : msg.to;
				if (!convMap.has(contactPhone)) {
					const openTodo = msg.todos.find((t) => !t.completed) ?? null;
					convMap.set(contactPhone, {
						contactPhone,
						lastMessage: msg.text,
						lastTimestamp: msg.timestamp,
						sessionId: msg.sessionId,
						latestTodo: openTodo
							? { ...openTodo, priority: openTodo.priority as string }
							: null,
						unreadCount: msg.direction === "INBOUND" ? 1 : 0,
					});
				}
			}

			return Array.from(convMap.values())
				.sort((a, b) => b.lastTimestamp.getTime() - a.lastTimestamp.getTime())
				.slice(0, 50)
				.map((c) => ({ ...c, contactPhone: formatPhone(c.contactPhone) }));
		}),

	/**
	 * Get all messages for a single conversation (by contact phone)
	 */
	getConversation: protectedProcedure
		.input(
			z.object({
				contactPhone: z.string(),
				sessionId: z.string().cuid().optional(),
				cursor: z.string().datetime().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const raw = input.contactPhone.replace(/\D/g, "");
			const messages = await prisma.message.findMany({
				where: {
					orgId: ctx.orgId,
					...(input.sessionId ? { sessionId: input.sessionId } : {}),
					...(input.cursor
						? { timestamp: { lt: new Date(input.cursor) } }
						: {}),
					OR: [{ from: raw }, { to: raw }],
				},
				orderBy: { timestamp: "desc" },
				take: 100,
				include: { todos: { where: { completed: false } } },
			});
			// Return in chronological order for display
			return messages.reverse();
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
			}),
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

			await enqueueMessageJob({
				type: "send_message",
				sessionId: input.sessionId,
				to: input.to,
				text: input.text,
				orgId: ctx.orgId,
			});

			return message;
		}),
});
