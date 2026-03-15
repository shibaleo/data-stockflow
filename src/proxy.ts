import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/api/(.*)",
]);

/**
 * sf_ API key → strip Authorization header so Clerk doesn't crash
 * trying to parse it as a Clerk JWT. The token is preserved in
 * X-Api-Key for Hono's auth layer to pick up.
 */
function hasApiKey(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice(7).startsWith("sf_");
}

export default function middleware(req: NextRequest) {
  if (hasApiKey(req)) {
    const token = req.headers.get("authorization")!.slice(7);
    const headers = new Headers(req.headers);
    headers.delete("authorization");
    headers.set("x-api-key", token);
    return NextResponse.next({ request: { headers } });
  }

  // All other requests → Clerk middleware
  return clerkMiddleware(async (auth, r) => {
    if (!isPublicRoute(r)) {
      await auth.protect();
    }
  })(req, {} as any);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
