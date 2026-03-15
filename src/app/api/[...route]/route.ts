import { auth } from "@clerk/nextjs/server";
import { handle } from "hono/vercel";
import app from "@/lib/hono-app";

export const runtime = "nodejs";

const honoHandler = handle(app);

/**
 * Check if request carries an API key via X-Api-Key header.
 * proxy.ts moves sf_ tokens from Authorization → X-Api-Key
 * before Clerk middleware processes the request.
 */
function hasApiKey(req: Request): boolean {
  return !!req.headers.get("x-api-key")?.startsWith("sf_");
}

/**
 * Route handler that bridges Clerk auth and Hono.
 *
 * - sf_ API key requests: proxy.ts strips Authorization and sets X-Api-Key,
 *   so we pass directly to Hono (auth.ts reads X-Api-Key).
 * - Browser requests: Clerk session → inject Bearer token → Hono.
 */
async function withClerkAuth(req: Request) {
  if (hasApiKey(req)) {
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
