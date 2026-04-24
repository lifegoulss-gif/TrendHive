import { prisma } from "@repo/database";
import { TRPCError, initTRPC } from "@trpc/server";
import type { NextRequest } from "next/server";
import superjson from "superjson";

const DEV_OWNER_ID = "dev_local_user";
const DEV_EMPLOYEE_ID = "dev_employee_user";

async function getOrCreateDevUsers() {
	// Owner
	let owner = await prisma.user.findUnique({
		where: { clerkId: DEV_OWNER_ID },
		select: { id: true, orgId: true, role: true, email: true },
	});

	if (!owner) {
		const org = await prisma.organization.create({
			data: { name: "Demo Company", slug: `dev-org-${Date.now()}` },
		});
		owner = await prisma.user.create({
			data: {
				clerkId: DEV_OWNER_ID,
				email: "owner@localhost",
				name: "Demo Owner",
				orgId: org.id,
				role: "OWNER",
			},
			select: { id: true, orgId: true, role: true, email: true },
		});
		console.log("[Dev] Auto-created owner + org:", org.id);
	}

	// Employee — lives in the same org as the owner
	let employee = await prisma.user.findUnique({
		where: { clerkId: DEV_EMPLOYEE_ID },
		select: { id: true, orgId: true, role: true, email: true },
	});

	if (!employee) {
		employee = await prisma.user.create({
			data: {
				clerkId: DEV_EMPLOYEE_ID,
				email: "employee@localhost",
				name: "Demo Employee",
				orgId: owner.orgId,
				role: "EMPLOYEE",
			},
			select: { id: true, orgId: true, role: true, email: true },
		});
		console.log("[Dev] Auto-created employee user in org:", owner.orgId);
	}

	// Link the first unassigned session in this org to the dev employee
	// so they have todos to see when switching to Employee view
	const unassignedSession = await prisma.whatsAppSession.findFirst({
		where: { orgId: owner.orgId, userId: null },
	});
	if (unassignedSession) {
		await prisma.whatsAppSession.update({
			where: { id: unassignedSession.id },
			data: { userId: employee.id },
		});
	}

	return { owner, employee };
}

export const createTRPCContext = async (opts: {
	req: NextRequest;
	// Pre-extracted from Clerk in the route handler's async context to avoid
	// AsyncLocalStorage loss inside fetchRequestHandler callbacks.
	preloadedUserId?: string | null;
}) => {
	let user = null;
	let orgId = null;

	try {
		if (process.env.NODE_ENV === "development") {
			// In dev, bypass Clerk. Switch between owner/employee via cookie.
			const devRole = opts.req.cookies.get("dev_role")?.value;
			const { owner, employee } = await getOrCreateDevUsers();
			user = devRole === "EMPLOYEE" ? employee : owner;
			orgId = user.orgId;
		} else {
			const userId = opts.preloadedUserId ?? null;

			if (userId) {
				user = await prisma.user.findUnique({
					where: { clerkId: userId },
					select: { id: true, orgId: true, role: true, email: true },
				});

				// Auto-provision if signed in with Clerk but no DB record yet
				// (webhook may not have fired yet for this preview deployment)
				if (!user) {
					const clerkUser = await fetch(
						`https://api.clerk.com/v1/users/${userId}`,
						{
							headers: {
								Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
							},
						},
					).then((r) => r.json());

					const email: string =
						clerkUser.email_addresses?.[0]?.email_address ??
						`${userId}@unknown.com`;
					const name: string | null = clerkUser.first_name ?? null;

					user = await prisma.$transaction(
						async (tx) => {
							const org = await tx.organization.create({
								data: {
									name: name ?? email.split("@")[0] ?? "My Org",
									slug: `org-${Date.now()}`,
									displayName: name,
								},
							});
							return tx.user.create({
								data: {
									clerkId: userId,
									email,
									name,
									orgId: org.id,
									role: "OWNER",
								},
								select: { id: true, orgId: true, role: true, email: true },
							});
						},
						{ timeout: 15000 },
					);
				}

				if (user) orgId = user.orgId;
			}
		}
	} catch (err) {
		console.error("[tRPC context error]", err);
	}

	return { user, orgId };
};

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
	transformer: superjson,
});

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.user || !ctx.orgId) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: { ...ctx, user: ctx.user, orgId: ctx.orgId },
	});
});

export const requireRole = (requiredRole: "OWNER" | "MANAGER" | "EMPLOYEE") =>
	protectedProcedure.use(async ({ ctx, next }) => {
		const roleHierarchy = { OWNER: 3, MANAGER: 2, EMPLOYEE: 1 };
		if (roleHierarchy[ctx.user.role] < roleHierarchy[requiredRole]) {
			throw new TRPCError({ code: "FORBIDDEN" });
		}
		return next();
	});

export const router = t.router;
export const middleware = t.middleware;
