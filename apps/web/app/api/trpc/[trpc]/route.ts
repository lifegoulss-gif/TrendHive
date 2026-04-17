import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createTRPCContext } from "@/server/trpc";
import { appRouter } from "@/server/routers";

export const handler = createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
});

export { handler as GET, handler as POST };
