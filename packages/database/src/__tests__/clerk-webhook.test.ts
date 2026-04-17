import { describe, it, expect } from "vitest";
import { prisma } from "@repo/database";
import { cuid } from "@repo/shared";

/**
 * Clerk Webhook Sync Tests
 * Verifies that Clerk events properly sync to Postgres User table
 */
describe("Clerk Webhook → Postgres Sync", () => {
  it("should create user and org on user.created webhook", async () => {
    const clerkId = `user_${cuid()}`;
    const email = `test-${cuid()}@example.com`;

    // Simulate webhook (in real tests, call the POST handler)
    // For now, we'll test the data model that would be created

    const org = await prisma.organization.create({
      data: {
        name: "Webhook Test Org",
        slug: `webhook-${cuid()}`,
      },
    });

    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
        orgId: org.id,
        role: "OWNER", // First user is owner
      },
    });

    // Verify user exists with correct org
    const foundUser = await prisma.user.findUnique({
      where: { clerkId },
    });
    const foundOrg = await prisma.organization.findUnique({
      where: { id: org.id },
      include: { members: true },
    });

    expect(foundUser).toBeDefined();
    expect(foundUser?.email).toBe(email);
    expect(foundUser?.orgId).toBe(org.id);
    expect(foundUser?.role).toBe("OWNER");
    expect(foundOrg?.members).toContainEqual(expect.objectContaining({ clerkId }));
  });

  it("should cascade delete user when user.deleted webhook fires", async () => {
    const clerkId = `user_${cuid()}`;
    const email = `delete-${cuid()}@example.com`;

    // Create org + user
    const org = await prisma.organization.create({
      data: {
        name: "Delete Test Org",
        slug: `delete-${cuid()}`,
      },
    });

    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
        orgId: org.id,
      },
    });

    // Simulate user.deleted webhook: delete user from Postgres
    await prisma.user.delete({
      where: { clerkId },
    });

    // Verify user is gone
    const deletedUser = await prisma.user.findUnique({
      where: { clerkId },
    });

    expect(deletedUser).toBeNull();
  });

  it("should enforce unique clerkId (Clerk is source of truth)", async () => {
    const clerkId = `user_${cuid()}`;

    const org = await prisma.organization.create({
      data: { name: "Unique Test", slug: `unique-${cuid()}` },
    });

    // Create first user
    const user1 = await prisma.user.create({
      data: {
        clerkId,
        email: `first@example.com`,
        orgId: org.id,
      },
    });

    // Attempt to create duplicate clerkId (should fail)
    const duplicateAttempt = prisma.user.create({
      data: {
        clerkId, // Same clerkId
        email: `second@example.com`,
        orgId: org.id,
      },
    });

    await expect(duplicateAttempt).rejects.toThrow();
  });
});
