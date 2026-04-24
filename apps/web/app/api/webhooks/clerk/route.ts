import { prisma } from "@repo/database";
import { type NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET ?? "";

type ClerkUser = {
	id: string;
	email: string | undefined;
	first_name: string | undefined;
	email_addresses?: Array<{ email_address: string }>;
};

export async function POST(req: NextRequest) {
	const body = await req.text();
	const wh = new Webhook(webhookSecret);

	let evt: { type: string; data: ClerkUser };
	try {
		const signature = req.headers.get("svix-signature");
		if (!signature) {
			return new NextResponse("Webhook signature missing", { status: 401 });
		}
		evt = wh.verify(body, {
			"svix-id": req.headers.get("svix-id") || "",
			"svix-timestamp": req.headers.get("svix-timestamp") || "",
			"svix-signature": signature,
		}) as { type: string; data: ClerkUser };
	} catch (err) {
		console.error("Webhook signature verification failed", err);
		return new NextResponse("Webhook signature invalid", { status: 401 });
	}

	switch (evt.type) {
		case "user.created": {
			const clerkUser = evt.data;
			const email =
				clerkUser.email_addresses?.[0]?.email_address || clerkUser.email;

			// All sign-ups (owner or invited employee) start with a new org + OWNER.
			// Invited employees are reassigned to the correct org + role when they
			// hit /join/[token]/accept after authenticating — no webhook magic needed.
			try {
				await prisma.$transaction(async (tx) => {
					const existing = await tx.user.findUnique({
						where: { clerkId: clerkUser.id },
					});
					if (existing) return;

					const org = await tx.organization.create({
						data: {
							name: clerkUser.first_name || email?.split("@")[0] || "My Org",
							slug: `org-${Date.now()}`,
							displayName: clerkUser.first_name,
						},
					});
					await tx.user.create({
						data: {
							clerkId: clerkUser.id,
							email: email ?? "",
							name: clerkUser.first_name,
							orgId: org.id,
							role: "OWNER",
						},
					});
				});
			} catch (err) {
				console.error("Failed to create user from Clerk webhook", err);
				return new NextResponse("User creation failed", { status: 500 });
			}
			break;
		}

		case "user.updated": {
			const clerkUser = evt.data;
			const email =
				clerkUser.email_addresses?.[0]?.email_address || clerkUser.email;
			try {
				await prisma.user.update({
					where: { clerkId: clerkUser.id },
					data: { email, name: clerkUser.first_name },
				});
			} catch (err) {
				console.error("Failed to update user from Clerk webhook", err);
				return new NextResponse("User update failed", { status: 500 });
			}
			break;
		}

		case "user.deleted": {
			try {
				await prisma.user.deleteMany({
					where: { clerkId: evt.data.id },
				});
			} catch (err) {
				console.error("Failed to delete user from Clerk webhook", err);
				return new NextResponse("User deletion failed", { status: 500 });
			}
			break;
		}
	}

	return new NextResponse(null, { status: 200 });
}
