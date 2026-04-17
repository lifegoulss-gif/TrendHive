import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/server/trpc";
import { appRouter } from "@/server/routers";
import { NextRequest } from "next/server";

const handler = async (req: NextRequest) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      return createTRPCContext({
        headers: req.headers,
      });
    },
  });
};

export { handler as GET, handler as POST };
