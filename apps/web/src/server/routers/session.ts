import { prisma } from "@repo/database";
import { Prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { createClient } from "redis";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../trpc";

const redis = createClient({
	url: process.env.UPSTASH_URL || "redis://localhost:6379",
	password: process.env.UPSTASH_TOKEN || undefined,
});
redis.on("error", () => {});
let redisConnected = false;
async function getRedis() {
	if (!redisConnected) {
		await redis.connect();
		redisConnected = true;
	}
	return redis;
}

async function assertSessionOwnership(sessionId: string, orgId: string) {
	const session = await prisma.whatsAppSession.findUnique({
		where: { id: sessionId },
	});
	if (!session || session.orgId !== orgId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Session not accessible",
		});
	}
	return session;
}

export const sessionRouter = router({
	// Employees can list sessions so they can see their own session status
	list: protectedProcedure.query(async ({ ctx }) => {
		return prisma.whatsAppSession.findMany({
			where: { orgId: ctx.orgId },
			orderBy: { createdAt: "desc" },
		});
	}),

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

	// MANAGER+ only — employees cannot connect new WhatsApp sessions
	create: requireRole("MANAGER")
		.input(z.object({ name: z.string().min(1).max(60).optional() }))
		.mutation(async ({ ctx, input }) => {
			const session = await prisma.whatsAppSession.create({
				data: {
					orgId: ctx.orgId,
					userId: ctx.user.id,
					name: input.name,
					status: "CONNECTING",
				},
			});

			const r = await getRedis();
			await r.publish(
				"worker:commands",
				JSON.stringify({
					command: "start",
					sessionId: session.id,
					orgId: ctx.orgId,
				}),
			);

			return session;
		}),

	getQr: protectedProcedure
		.input(z.string().cuid())
		.query(async ({ ctx, input: sessionId }) => {
			const session = await prisma.whatsAppSession.findUnique({
				where: { id: sessionId },
				select: { orgId: true, pendingQr: true, status: true },
			});
			if (!session || session.orgId !== ctx.orgId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found",
				});
			}
			return { qr: session.pendingQr, status: session.status };
		}),

	disconnect: requireRole("MANAGER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: sessionId }) => {
			const session = await assertSessionOwnership(sessionId, ctx.orgId);

			const r = await getRedis();
			await r.publish(
				"worker:commands",
				JSON.stringify({ command: "stop", sessionId, orgId: session.orgId }),
			);

			return prisma.whatsAppSession.update({
				where: { id: sessionId },
				data: { status: "DISCONNECTED", pendingQr: null },
			});
		}),

	/**
	 * Reconnect: clear stale auth blob → restart worker → user scans fresh QR
	 * Works for DISCONNECTED, ERROR, and stuck CONNECTING sessions.
	 */
	reconnect: requireRole("MANAGER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: sessionId }) => {
			const session = await assertSessionOwnership(sessionId, ctx.orgId);

			// Clear auth blob so worker starts fresh (new QR, not resume)
			const updated = await prisma.whatsAppSession.update({
				where: { id: sessionId },
				data: {
					authData: Prisma.DbNull,
					pendingQr: null,
					errorMessage: null,
					status: "CONNECTING",
				},
			});

			const r = await getRedis();
			// "restart" command: worker stops any existing client, then initializes fresh
			await r.publish(
				"worker:commands",
				JSON.stringify({ command: "restart", sessionId, orgId: session.orgId }),
			);

			return updated;
		}),

	/**
	 * Permanently delete a session and its auth data.
	 * Stops the worker client first if it's running.
	 */
	delete: requireRole("MANAGER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: sessionId }) => {
			await assertSessionOwnership(sessionId, ctx.orgId);

			// Tell worker to stop this session (best effort — may already be stopped)
			try {
				const r = await getRedis();
				await r.publish(
					"worker:commands",
					JSON.stringify({ command: "stop", sessionId, orgId: ctx.orgId }),
				);
			} catch {}

			await prisma.whatsAppSession.delete({ where: { id: sessionId } });
		}),

	/**
	 * Force reset to DISCONNECTED without starting a new connection.
	 * Use this to cancel a stuck CONNECTING session.
	 */
	forceReset: requireRole("MANAGER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: sessionId }) => {
			const session = await assertSessionOwnership(sessionId, ctx.orgId);

			const r = await getRedis();
			await r.publish(
				"worker:commands",
				JSON.stringify({ command: "stop", sessionId, orgId: session.orgId }),
			);

			return prisma.whatsAppSession.update({
				where: { id: sessionId },
				data: {
					status: "DISCONNECTED",
					pendingQr: null,
					authData: Prisma.DbNull,
					errorMessage: null,
				},
			});
		}),
});
