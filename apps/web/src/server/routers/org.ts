import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "../trpc";

/**
 * Organization router - org info, members, settings
 */
export const orgRouter = router({
	/**
	 * Get current authenticated user's profile + role
	 */
	me: protectedProcedure.query(async ({ ctx }) => {
		return prisma.user.findUnique({
			where: { id: ctx.user.id },
			select: { id: true, name: true, email: true, role: true },
		});
	}),

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
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});
	}),

	/**
	 * Update organization name / displayName
	 */
	update: requireRole("MANAGER")
		.input(z.object({ name: z.string().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			return prisma.organization.update({
				where: { id: ctx.orgId },
				data: { name: input.name },
				select: { id: true, name: true },
			});
		}),

	/**
	 * Update a member's role (OWNER only)
	 */
	updateMemberRole: requireRole("OWNER")
		.input(
			z.object({
				userId: z.string().cuid(),
				role: z.enum(["MANAGER", "EMPLOYEE"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const member = await prisma.user.findUnique({
				where: { id: input.userId },
			});
			if (!member || member.orgId !== ctx.orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}
			return prisma.user.update({
				where: { id: input.userId },
				data: { role: input.role },
				select: { id: true, role: true },
			});
		}),

	/**
	 * Remove a member from the organization (OWNER only)
	 */
	removeMember: requireRole("OWNER")
		.input(z.string().cuid())
		.mutation(async ({ ctx, input: userId }) => {
			const member = await prisma.user.findUnique({ where: { id: userId } });
			if (!member || member.orgId !== ctx.orgId) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
			}
			if (member.role === "OWNER") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Cannot remove the organization owner",
				});
			}
			await prisma.user.delete({ where: { id: userId } });
			return { success: true };
		}),
});
