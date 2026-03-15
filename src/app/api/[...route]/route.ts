import { auth } from "@clerk/nextjs/server";
import { handle } from "hono/vercel";
import app from "@/lib/hono-app";

export const runtime = "nodejs";

const honoHandler = handle(app);

/**
 * Check if request already carries an API key (sf_) or dev JWT token.
 * In that case, skip Clerk auth and pass directly to Hono.
 */
function hasNonClerkToken(req: Request): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  // sf_ = API key, dev HS256 tokens also skip Clerk
  return token.startsWith("sf_");
}

/**
 * Inject Clerk session token as Bearer header before passing to Hono.
 * Clerk's proxy sets auth context on the Next.js request,
 * but Hono reads Bearer tokens — this bridges the two.
 *
 * If the request already has an sf_ API key, skip Clerk entirely.
 */
async function withClerkAuth(req: Request) {
  if (hasNonClerkToken(req)) {
    return honoHandler(req);
  }

  const { userId, getToken } = await auth();
  if (userId) {
    const token = await getToken();
    if (token) {
      const headers = new Headers(req.headers);
      headers.set("Authorization", `Bearer ${token}`);
      req = new Request(req.url, {
        method: req.method,
        headers,
        body: req.body,
        // @ts-expect-error duplex needed for streaming body
        duplex: "half",
      });
    }
  }
  return honoHandler(req);
}

export const GET = withClerkAuth;
export const POST = withClerkAuth;
export const PUT = withClerkAuth;
export const DELETE = withClerkAuth;
export const PATCH = withClerkAuth;
