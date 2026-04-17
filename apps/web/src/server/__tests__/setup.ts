import { beforeEach, afterAll } from "vitest";
import { prisma } from "@repo/database";

/**
 * Reset database before each test
 */
beforeEach(async () => {
  // Delete test data in reverse FK dependency order
  await Promise.all([
    prisma.todo.deleteMany({}),
    prisma.rateLimit.deleteMany({}),
    prisma.message.deleteMany({}),
    prisma.subscription.deleteMany({}),
  ]);

  await prisma.whatsAppSession.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
});

/**
 * Disconnect Prisma after all tests
 */
afterAll(async () => {
  await prisma.$disconnect();
});
