import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

function hasLocalSession(req: NextRequest): boolean {
  return !!req.cookies.get("__local_session")?.value;
}

export default function middleware(req: NextRequest) {
  if (hasApiKey(req)) {
    const token = req.headers.get("authorization")!.slice(7);
    const headers = new Headers(req.headers);
    headers.delete("authorization");
    headers.set("x-api-key", token);
    return NextResponse.next({ request: { headers } });
  }

  // Local password session → skip Clerk (auth.ts handles HS256 JWT)
  if (hasLocalSession(req)) {
    return NextResponse.next();
  }

  // Clerk middleware — all pages are public (AuthGate handles access control).
  // Clerk only needs to run so that useAuth() hooks work in the client.
  return clerkMiddleware()(req, {} as any);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
