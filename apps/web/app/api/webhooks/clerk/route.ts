import { Webhook } from "svix";
import { prisma } from "@repo/database";
import { NextRequest, NextResponse } from "next/server";

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!;

/**
 * Clerk user.created and user.deleted webhook handler
 * Keeps Postgres User table in sync with Clerk auth
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let evt: any;
  try {
    evt = wh.verify(body, req.headers.get("svix-signature") || "");
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new NextResponse("Webhook signature invalid", { status: 401 });
  }

  switch (evt.type) {
    case "user.created": {
      const clerkUser = evt.data;
      const email =
        clerkUser.email_addresses?.[0]?.email_address || clerkUser.email;

      // Create org and user in one transaction
      try {
        await prisma.$transaction(async (tx) => {
          // Check if user already exists (safety)
          const existing = await tx.user.findUnique({
            where: { clerkId: clerkUser.id },
          });
          if (existing) return;

          // Create org for first user
          const org = await tx.organization.create({
            data: {
              name: clerkUser.first_name || email.split("@")[0] || "My Org",
              slug: `org-${Date.now()}`,
              displayName: clerkUser.first_name,
            },
          });

          // Create user with OWNER role
          await tx.user.create({
            data: {
              clerkId: clerkUser.id,
              email,
              name: clerkUser.first_name,
              orgId: org.id,
              role: "OWNER", // First user is owner
            },
          });
        });
      } catch (err) {
        console.error("Failed to create user from Clerk webhook", err);
        return new NextResponse("User creation failed", { status: 500 });
      }
      break;
    }

    case "user.deleted": {
      try {
        // Cascade delete via schema
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
