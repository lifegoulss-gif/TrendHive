import { beforeEach, afterAll } from "vitest";
import { prisma } from "../index";

/**
 * Reset database before each test
 * Delete in reverse FK dependency order
 */
beforeEach(async () => {
  // Delete test data in correct order (leafs first, roots last)
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
