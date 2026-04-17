import { describe, it, expect, vi, beforeEach } from "vitest";
import { cuid } from "@repo/shared";

/**
 * Mock Clerk Webhook Sync Tests
 */

type MockUser = { id: string; clerkId: string; email: string; orgId: string; role: string };
type MockOrg = { id: string; name: string; slug: string; members?: MockUser[] };

let mockUsers: MockUser[] = [];
let mockOrgs: MockOrg[] = [];

function createMockPrisma() {
  return {
    organization: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        const org: MockOrg = { id, ...data };
        mockOrgs.push(org);
        return org;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const org = mockOrgs.find(o => o.id === where.id);
        if (!org) return null;
        if (include?.members) {
          return { ...org, members: mockUsers.filter(u => u.orgId === org.id) };
        }
        return org;
      }),
      deleteMany: vi.fn(async () => ({ count: mockOrgs.length })),
    },
    user: {
      create: vi.fn(async ({ data }: any) => {
        if (mockUsers.some(u => u.clerkId === data.clerkId)) {
          throw new Error("P2002: Unique constraint failed on the fields: (`clerkId`)");
        }
        const id = cuid();
        const user: MockUser = { id, ...data };
        mockUsers.push(user);
        return user;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.clerkId) {
          return mockUsers.find(u => u.clerkId === where.clerkId) || null;
        }
        return mockUsers.find(u => u.id === where.id) || null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const user = mockUsers.find(u => u.clerkId === where.clerkId);
        if (!user) {
          throw new Error("P2025: An operation failed because it depends on one or more records that were required but not found.");
        }
        mockUsers = mockUsers.filter(u => u.clerkId !== where.clerkId);
        return user;
      }),
      deleteMany: vi.fn(async () => ({ count: mockUsers.length })),
    },
    rateLimit: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    subscription: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    message: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    whatsAppSession: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    todo: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

vi.mock("../index", () => {
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma,
    default: mockPrisma,
  };
});

import { prisma } from "../index";

describe("Clerk Webhook → Postgres Sync", () => {
  beforeEach(() => {
    mockUsers = [];
    mockOrgs = [];
    vi.clearAllMocks();
  });

  it("should create user and org on user.created webhook", async () => {
    const clerkId = `user_${cuid()}`;
    const email = `test-${cuid()}@example.com`;

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
        role: "OWNER",
      },
    });

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

    await prisma.user.delete({
      where: { clerkId },
    });

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

    const user1 = await prisma.user.create({
      data: {
        clerkId,
        email: `first@example.com`,
        orgId: org.id,
      },
    });

    const duplicateAttempt = prisma.user.create({
      data: {
        clerkId,
        email: `second@example.com`,
        orgId: org.id,
      },
    });

    await expect(duplicateAttempt).rejects.toThrow("Unique constraint failed");
  });
});
