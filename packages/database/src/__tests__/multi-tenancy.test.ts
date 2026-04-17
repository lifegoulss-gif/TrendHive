import { describe, it, expect } from "vitest";
import { prisma } from "../index";
import { cuid } from "@repo/shared";

/**
 * Multi-Tenancy Isolation Tests
 * CRITICAL: ensure orgs cannot leak data to each other
 */
describe("Multi-Tenancy Isolation", () => {
  it("should not leak messages between orgs", async () => {
    const org1 = await prisma.organization.create({
      data: { name: "Org 1", slug: `org-1-${cuid()}` },
    });
    const org2 = await prisma.organization.create({
      data: { name: "Org 2", slug: `org-2-${cuid()}` },
    });

    // Create session in org1
    const session1 = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    // Create message in org1
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

    // Query org2's messages (should be empty)
    const org2Messages = await prisma.message.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Messages).toHaveLength(0);
    expect(org2Messages).not.toContainEqual(expect.objectContaining({ id: msg1.id }));
  });

  it("should not leak todos between orgs", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({
        data: { name: "Org 1", slug: `org-1-${cuid()}` },
      }),
      prisma.organization.create({
        data: { name: "Org 2", slug: `org-2-${cuid()}` },
      }),
    ]);

    // Create message + todo in org1
    const session = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    const msg = await prisma.message.create({
      data: {
        orgId: org1.id,
        sessionId: session.id,
        from: "+1111111111",
        to: "+2222222222",
        text: "hello with todo",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const todo = await prisma.todo.create({
      data: {
        orgId: org1.id,
        messageId: msg.id,
        title: "Secret todo from org1",
      },
    });

    // Query org2's todos (should be empty)
    const org2Todos = await prisma.todo.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Todos).toHaveLength(0);
    expect(org2Todos).not.toContainEqual(expect.objectContaining({ id: todo.id }));
  });

  it("should not leak users between orgs", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({
        data: { name: "Org 1", slug: `org-1-${cuid()}` },
      }),
      prisma.organization.create({
        data: { name: "Org 2", slug: `org-2-${cuid()}` },
      }),
    ]);

    // Create user in org1
    const user1 = await prisma.user.create({
      data: {
        clerkId: `clerk-user-1-${cuid()}`,
        email: `user1-${cuid()}@org1.example.com`,
        orgId: org1.id,
        role: "EMPLOYEE",
      },
    });

    // Query org2's users
    const org2Users = await prisma.user.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Users).toHaveLength(0);
    expect(org2Users).not.toContainEqual(expect.objectContaining({ id: user1.id }));
  });

  it("should cascade delete when org is deleted", async () => {
    const org = await prisma.organization.create({
      data: { name: "Org to Delete", slug: `delete-${cuid()}` },
    });

    // Create related data
    const user = await prisma.user.create({
      data: {
        clerkId: `clerk-${cuid()}`,
        email: `test-${cuid()}@example.com`,
        orgId: org.id,
      },
    });

    const session = await prisma.whatsAppSession.create({
      data: { orgId: org.id, phoneNumber: "+1234567890" },
    });

    const msg = await prisma.message.create({
      data: {
        orgId: org.id,
        sessionId: session.id,
        from: "+1234567890",
        to: "+1111111111",
        text: "test",
        direction: "INBOUND",
        timestamp: new Date(),
      },
    });

    const todo = await prisma.todo.create({
      data: {
        orgId: org.id,
        messageId: msg.id,
        title: "Test todo",
      },
    });

    // Delete org
    await prisma.organization.delete({
      where: { id: org.id },
    });

    // Verify all related data is deleted
    const deletedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    const deletedSession = await prisma.whatsAppSession.findUnique({
      where: { id: session.id },
    });
    const deletedMessage = await prisma.message.findUnique({
      where: { id: msg.id },
    });
    const deletedTodo = await prisma.todo.findUnique({
      where: { id: todo.id },
    });

    expect(deletedUser).toBeNull();
    expect(deletedSession).toBeNull();
    expect(deletedMessage).toBeNull();
    expect(deletedTodo).toBeNull();
  });

  it("should not leak sessions between orgs", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({
        data: { name: "Org 1", slug: `org-1-${cuid()}` },
      }),
      prisma.organization.create({
        data: { name: "Org 2", slug: `org-2-${cuid()}` },
      }),
    ]);

    // Create session in org1
    const session1 = await prisma.whatsAppSession.create({
      data: { orgId: org1.id, phoneNumber: "+1111111111" },
    });

    // Query org2's sessions
    const org2Sessions = await prisma.whatsAppSession.findMany({
      where: { orgId: org2.id },
    });

    expect(org2Sessions).toHaveLength(0);
    expect(org2Sessions).not.toContainEqual(expect.objectContaining({ id: session1.id }));
  });

  it("should not leak subscriptions between orgs", async () => {
    const [org1, org2] = await Promise.all([
      prisma.organization.create({
        data: { name: "Org 1", slug: `org-1-${cuid()}` },
      }),
      prisma.organization.create({
        data: { name: "Org 2", slug: `org-2-${cuid()}` },
      }),
    ]);

    // Create subscription in org1
    const sub1 = await prisma.subscription.create({
      data: {
        orgId: org1.id,
        stripeCustomerId: `cust-${cuid()}`,
        status: "ACTIVE",
      },
    });

    // Query org2's subscription (should not exist)
    const org2Sub = await prisma.subscription.findUnique({
      where: { orgId: org2.id },
    });

    expect(org2Sub).toBeNull();
  });
});
