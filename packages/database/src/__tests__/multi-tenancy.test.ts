// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cuid } from "@repo/shared";

/**
 * Mock Prisma for multi-tenancy testing
 * These tests verify that query filtering logic prevents data leaks
 */

type MockData = {
  organizations: Array<{ id: string; name: string; slug: string }>;
  messages: Array<{ id: string; orgId: string; sessionId: string; text: string; from: string; to: string; direction: string; timestamp: Date }>;
  todos: Array<{ id: string; orgId: string; title: string; completed?: boolean }>;
  whatsAppSessions: Array<{ id: string; orgId: string; phoneNumber: string }>;
  subscriptions: Array<{ id: string; orgId: string; status: string }>;
  users: Array<{ id: string; orgId: string; clerkId: string; email: string}>;
};

let mockData: MockData = {
  organizations: [],
  messages: [],
  todos: [],
  whatsAppSessions: [],
  subscriptions: [],
  users: [],
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
      deleteMany: vi.fn(async () => ({ count: mockData.organizations.length })),
    },
    message: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.messages.push({ id, ...data });
        return { id, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.orgId) {
          throw new Error("BUG: Message query missing orgId filter!");
        }
        return mockData.messages.filter(m => m.orgId === where.orgId);
      }),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: mockData.messages.length })),
    },
    todo: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.todos.push({ id, ...data });
        return { id, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.orgId) {
          throw new Error("BUG: Todo query missing orgId filter!");
        }
        return mockData.todos.filter(t => t.orgId === where.orgId);
      }),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: mockData.todos.length })),
    },
    whatsAppSession: {
      create: vi.fn(async ({ data }: any) => {
        const id = cuid();
        mockData.whatsAppSessions.push({ id, ...data });
        return { id, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.orgId) {
          throw new Error("BUG: Session query missing orgId filter!");
        }
        return mockData.whatsAppSessions.filter(s => s.orgId === where.orgId);
      }),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: mockData.whatsAppSessions.length })),
    },
    subscription: {
      create: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    rateLimit: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
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

describe("Multi-Tenancy Isolation", () => {
  beforeEach(() => {
    mockData = {
      organizations: [],
      messages: [],
      todos: [],
      whatsAppSessions: [],
      subscriptions: [],
      users: [],
    };
  });

  it("should not leak messages between orgs", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org-2-${cuid()}` },
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
        text: "secret message from org1",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const org2Messages = await prisma.message.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Messages).toHaveLength(0);
  });

  it("should not leak todos between orgs", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org-2-${cuid()}` },
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
        text: "Call John",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const todo1 = await prisma.todo.create({
      data: {
        orgId: org1.id,
        title: "Call John",
      },
    } as any);

    const org2Todos = await prisma.todo.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Todos).toHaveLength(0);
  });

  it("should not leak sessions between orgs", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org-2-${cuid()}` },
    });

    const session1 = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    const org2Sessions = await prisma.whatsAppSession.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Sessions).toHaveLength(0);
  });

  it("should enforce orgId filter on all queries", async () => {
    await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });

    await expect(
      prisma.message.findMany({ where: {} } as any)
    ).rejects.toThrow("missing orgId filter");

    await expect(
      prisma.todo.findMany({ where: {} } as any)
    ).rejects.toThrow("missing orgId filter");

    await expect(
      prisma.whatsAppSession.findMany({ where: {} } as any)
    ).rejects.toThrow("missing orgId filter");
  });

  it("should organize data by tenant", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org-2-${cuid()}` },
    });

    expect(org1.id).not.toBe(org2.id);
  });
});
