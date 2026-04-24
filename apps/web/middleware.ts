import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/auth/sign-in(.*)",
  "/auth/sign-up(.*)",
  "/join(.*)",
  "/api/webhooks/(.*)",
  "/api/pusher(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Always inject x-pathname so server components (e.g. dashboard layout) can read the current path
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  // In development, skip auth wall so you can test without Clerk
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/auth/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
