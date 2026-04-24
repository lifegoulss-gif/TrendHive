import { router } from "../trpc";
import { inviteRouter } from "./invite";
import { messageRouter } from "./message";
import { orgRouter } from "./org";
import { sessionRouter } from "./session";
import { todoRouter } from "./todo";

/**
 * Main app router - combines all routers
 */
export const appRouter = router({
	org: orgRouter,
	message: messageRouter,
	todo: todoRouter,
	session: sessionRouter,
	invite: inviteRouter,
});

export type AppRouter = typeof appRouter;
