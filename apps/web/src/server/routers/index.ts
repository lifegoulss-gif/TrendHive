import { orgRouter } from "./org";
import { messageRouter } from "./message";
import { todoRouter } from "./todo";
import { sessionRouter } from "./session";
import { router } from "../trpc";

/**
 * Main app router - combines all routers
 */
export const appRouter = router({
  org: orgRouter,
  message: messageRouter,
  todo: todoRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
