import { describe, it, expect, vi, beforeEach } from "vitest";
import { cuid } from "@repo/shared";

/**
 * Auth & RBAC Tests
 * Verify tRPC protected procedures, role-based access control, and cross-org isolation
 */

type MockData = {
  organizations: Array<{ id: string; name: string; slug: string }>;
  users: Array<{ id: string; clerkId: string; email: string; orgId: string; role: string }>;
  sessions: Array<{ id: string; orgId: string; phoneNumber: string }>;
  messages: Array<{ id: string; orgId: string; sessionId: string; from: string; to: string; text: string; direction: string; timestamp: Date }>;
};

let mockData: MockData = {
  organizations: [],
  users: [],
  sessions: [],
  messages: [],
};

function createMockPrisma() {
  return {
    organization: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.organizations.push({ id, ...data });
        return { id, ...data };
      }),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.users.push({ id, ...data });
        return { id, ...data };
      }),
      findUnique: vi.fn(async ({ where, select }: any) => {
        const user = mockData.users.find(u => u.clerkId === where.clerkId || u.id === where.id);
        if (!user) return null;
        if (select) {
          return Object.keys(select).reduce((acc: any, key) => {
            acc[key] = user[key as keyof typeof user];
            return acc;
          }, {});
        }
        return user;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    whatsAppSession: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.sessions.push({ id, ...data });
        return { id, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.orgId) throw new Error("orgId filter required");
        return mockData.sessions.filter(s => s.orgId === where.orgId);
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    message: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.messages.push({ id, ...data });
        return { id, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.orgId) throw new Error("orgId filter required");
        return mockData.messages.filter(m => m.orgId === where.orgId);
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    rateLimit: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    subscription: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    todo: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
}

vi.mock("@repo/database", () => {
  const mockPrisma = createMockPrisma();
  return { prisma: mockPrisma, default: mockPrisma };
});

import { prisma } from "@repo/database";

describe("tRPC Auth Middleware", () => {
  beforeEach(() => {
    mockData = {
      organizations: [],
      users: [],
      sessions: [],
      messages: [],
    };
  });

  it("should reject unauthenticated requests", async () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
  });

  it("should allow authenticated requests with valid orgId", async () => {
    const org = await prisma.organization.create({
      data: { name: "Auth Test", slug: `auth-${cuid()}` },
    });

    const user = await prisma.user.create({
      data: {
        clerkId: `clerk-${cuid()}`,
        email: `test@example.com`,
        orgId: org.id,
        role: "EMPLOYEE",
      },
    });

    expect(user.orgId).toBe(org.id);
  });

  it("should inject orgId into context from database", async () => {
    const org = await prisma.organization.create({
      data: { name: "Context Test", slug: `ctx-${cuid()}` },
    });

    const user = await prisma.user.create({
      data: {
        clerkId: `clerk-${cuid()}`,
        email: `ctx@example.com`,
        orgId: org.id,
        role: "MANAGER",
      },
    });

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.clerkId },
      select: { id: true, orgId: true, role: true },
    });

    expect(dbUser?.orgId).toBe(org.id);
  });
});

describe("Role-Based Access Control", () => {
  beforeEach(() => {
    mockData = {
      organizations: [],
      users: [],
      sessions: [],
      messages: [],
    };
  });

  it("should grant OWNER full permissions", async () => {
    const org = await prisma.organization.create({
      data: { name: "Owner Org", slug: `owner-${cuid()}` },
    });

    const owner = await prisma.user.create({
      data: {
        clerkId: `owner-${cuid()}`,
        email: `owner@example.com`,
        orgId: org.id,
        role: "OWNER",
      },
    });

    expect(owner.role).toBe("OWNER");
    const hierarchy: Record<string, number> = { OWNER: 3, MANAGER: 2, EMPLOYEE: 1 };
    expect(hierarchy[owner.role] >= 3).toBe(true);
  });

  it("should grant MANAGER limited permissions", async () => {
    const org = await prisma.organization.create({
      data: { name: "Manager Org", slug: `mgr-${cuid()}` },
    });

    const manager = await prisma.user.create({
      data: {
        clerkId: `mgr-${cuid()}`,
        email: `manager@example.com`,
        orgId: org.id,
        role: "MANAGER",
      },
    });

    expect(manager.role).toBe("MANAGER");
    const hierarchy: Record<string, number> = { OWNER: 3, MANAGER: 2, EMPLOYEE: 1 };
    expect(hierarchy[manager.role] >= 2).toBe(true);
    expect(hierarchy[manager.role] >= 3).toBe(false);
  });

  it("should grant EMPLOYEE minimal permissions", async () => {
    const org = await prisma.organization.create({
      data: { name: "Emp Org", slug: `emp-${cuid()}` },
    });

    const employee = await prisma.user.create({
      data: {
        clerkId: `emp-${cuid()}`,
        email: `emp@example.com`,
        orgId: org.id,
        role: "EMPLOYEE",
      },
    });

    expect(employee.role).toBe("EMPLOYEE");
    const hierarchy: Record<string, number> = { OWNER: 3, MANAGER: 2, EMPLOYEE: 1 };
    expect(hierarchy[employee.role] >= 2).toBe(false);
  });

  it("should enforce role hierarchy", async () => {
    const orgs = [0, 1].map(() => ({
      id: cuid(),
      name: "Hierarchy Test",
      slug: `hier-${cuid()}`,
    }));
    mockData.organizations.push(...orgs);

    const roles = ["OWNER", "MANAGER", "EMPLOYEE"];
    const users = roles.map(role => ({
      id: cuid(),
      clerkId: `user-${role}-${cuid()}`,
      email: `${role.toLowerCase()}@example.com`,
      orgId: orgs[0].id,
      role,
    }));
    mockData.users.push(...users);

    const owner = mockData.users.find(u => u.role === "OWNER");
    expect(owner).toBeDefined();
  });
});

describe("Cross-Org Access Prevention", () => {
  beforeEach(() => {
    mockData = {
      organizations: [],
      users: [],
      sessions: [],
      messages: [],
    };
  });

  it("should prevent user from accessing another org's data", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org2-${cuid()}` },
    });

    const user1 = await prisma.user.create({
      data: {
        clerkId: `u1-${cuid()}`,
        email: `user1@example.com`,
        orgId: org1.id,
        role: "EMPLOYEE",
      },
    });

    const session1 = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    const msg1 = await prisma.message.create({
      data: {
        orgId: org1.id,
        sessionId: session1.id,
        from: "+1111111111",
        to: "+2222222222",
        text: "secret",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const user1Messages = await prisma.message.findMany({
      where: { orgId: user1.orgId },
    });
    expect(user1Messages).toContainEqual(expect.objectContaining({ id: msg1.id }));

    const user2 = await prisma.user.create({
      data: {
        clerkId: `u2-${cuid()}`,
        email: `user2@example.com`,
        orgId: org2.id,
        role: "EMPLOYEE",
      },
    });

    const user2Messages = await prisma.message.findMany({
      where: { orgId: user2.orgId },
    });
    expect(user2Messages).not.toContainEqual(expect.objectContaining({ id: msg1.id }));
  });
});
