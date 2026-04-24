import { auth as clerkAuth } from "@clerk/nextjs/server";
import { appRouter } from "@/server/routers";
import { createTRPCContext } from "@/server/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

const handler = async (req: NextRequest) => {
	// Extract Clerk userId here, in the route handler's async context where
	// Clerk's AsyncLocalStorage is guaranteed to be populated by the middleware.
	// fetchRequestHandler may not preserve this context in its own callbacks.
	let preloadedUserId: string | null = null;
	if (process.env.NODE_ENV !== "development") {
		try {
			const { userId } = await clerkAuth();
			preloadedUserId = userId;
		} catch {}
	}

	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: async () => {
			return createTRPCContext({ req, preloadedUserId });
		},
	});
};

export { handler as GET, handler as POST };
