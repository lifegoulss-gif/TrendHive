import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { z } from "zod";
import { protectedProcedure, publicProcedure, requireRole, router } from "../trpc";

const resend = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

const INVITE_EXPIRES_HOURS = 72;

async function sendInviteEmail(
	to: string,
	orgName: string,
	inviterName: string,
	token: string,
	role: string,
) {
	if (!resend) return;
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
	const link = `${baseUrl}/join/${token}`;
	const roleLabel = role === "MANAGER" ? "Manager" : "Employee";

	await resend.emails.send({
		from: "UniboxAI <invites@yourdomain.com>",
		to,
		subject: `${inviterName} invited you to join ${orgName} on UniboxAI`,
		text: [
			`Hi,`,
			``,
			`${inviterName} has invited you to join ${orgName} on UniboxAI as a ${roleLabel}.`,
			``,
			`Click the link below to accept your invitation:`,
			link,
			``,
			`This invite expires in ${INVITE_EXPIRES_HOURS} hours.`,
			``,
			`— UniboxAI`,
		].join("\n"),
	});
}

export const inviteRouter = router({
	/**
	 * Create an invite for a new employee or manager.
	 * OWNER and MANAGER can invite. Only OWNER can invite MANAGER.
	 */
	create: requireRole("MANAGER")
		.input(
			z.object({
				email: z.string().email(),
				role: z.enum(["EMPLOYEE", "MANAGER"]).default("EMPLOYEE"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Only OWNER can invite MANAGER
			if (input.role === "MANAGER" && ctx.user.role !== "OWNER") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the owner can invite managers",
				});
			}

			// Block re-inviting someone already in the org
			const existing = await prisma.user.findFirst({
				where: { orgId: ctx.orgId, email: input.email },
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This person is already a member of your organization",
				});
			}

			// Expire any old pending invite for this email in this org
			await prisma.invite.updateMany({
				where: {
					orgId: ctx.orgId,
					email: input.email,
					acceptedAt: null,
				},
				data: { expiresAt: new Date() },
			});

			const invite = await prisma.invite.create({
				data: {
					orgId: ctx.orgId,
					email: input.email,
					role: input.role,
					expiresAt: new Date(
						Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000,
					),
				},
			});

			const [org, inviter] = await Promise.all([
				prisma.organization.findUnique({
					where: { id: ctx.orgId },
					select: { name: true },
				}),
				prisma.user.findUnique({
					where: { id: ctx.user.id },
					select: { name: true, email: true },
				}),
			]);

			await sendInviteEmail(
				input.email,
				org?.name ?? "your organization",
				inviter?.name ?? inviter?.email ?? "Your manager",
				invite.token,
				input.role,
			);

			return { token: invite.token };
		}),

	/**
	 * Validate an invite token — public, no auth needed.
	 * Returns enough info to render the /join/[token] page.
	 */
	validate: publicProcedure
		.input(z.object({ token: z.string() }))
		.query(async ({ input }) => {
			const invite = await prisma.invite.findUnique({
				where: { token: input.token },
				include: {
					org: { select: { name: true, displayName: true, avatar: true } },
				},
			});

			if (!invite) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
			}
			if (invite.acceptedAt) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This invite has already been used",
				});
			}
			if (invite.expiresAt < new Date()) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "This invite has expired. Ask your manager for a new one.",
				});
			}

			return {
				orgName: invite.org.displayName ?? invite.org.name,
				orgAvatar: invite.org.avatar,
				email: invite.email,
				role: invite.role,
				expiresAt: invite.expiresAt,
			};
		}),

	/**
	 * Accept an invite — called after the user has authenticated with Clerk.
	 * Reassigns them from their placeholder org to the invite's org.
	 */
	accept: protectedProcedure
		.input(z.object({ token: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const invite = await prisma.invite.findUnique({
				where: { token: input.token },
			});

			if (!invite) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
			}
			if (invite.acceptedAt) {
				// Already accepted — just redirect them to the dashboard
				return { orgId: invite.orgId };
			}
			if (invite.expiresAt < new Date()) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "This invite has expired",
				});
			}

			const oldOrgId = ctx.orgId;

			// Reassign the user to the invite's org with the correct role
			await prisma.$transaction(async (tx) => {
				await tx.user.update({
					where: { id: ctx.user.id },
					data: { orgId: invite.orgId, role: invite.role },
				});

				await tx.invite.update({
					where: { token: input.token },
					data: { acceptedAt: new Date() },
				});

				// Clean up the placeholder org the Clerk webhook auto-created,
				// but only if it's empty (no sessions, no messages — truly a throwaway).
				if (oldOrgId !== invite.orgId) {
					const orgUsage = await tx.organization.findUnique({
						where: { id: oldOrgId },
						select: {
							_count: { select: { members: true, sessions: true, messages: true } },
						},
					});
					const isEmpty =
						orgUsage &&
						orgUsage._count.members <= 1 &&
						orgUsage._count.sessions === 0 &&
						orgUsage._count.messages === 0;

					if (isEmpty) {
						await tx.organization.delete({ where: { id: oldOrgId } });
					}
				}
			});

			return { orgId: invite.orgId };
		}),

	/**
	 * List pending invites for the current org (OWNER / MANAGER view)
	 */
	listPending: requireRole("MANAGER").query(async ({ ctx }) => {
		return prisma.invite.findMany({
			where: {
				orgId: ctx.orgId,
				acceptedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				email: true,
				role: true,
				expiresAt: true,
				createdAt: true,
				token: true,
			},
		});
	}),

	/**
	 * Revoke a pending invite
	 */
	revoke: requireRole("MANAGER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: inviteId }) => {
			const invite = await prisma.invite.findUnique({
				where: { id: inviteId },
			});
			if (!invite || invite.orgId !== ctx.orgId) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			await prisma.invite.update({
				where: { id: inviteId },
				data: { expiresAt: new Date() },
			});
			return { success: true };
		}),
});
