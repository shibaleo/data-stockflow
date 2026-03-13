import { Hono } from "hono";
import { auth } from "@clerk/nextjs/server";
import { handle } from "hono/vercel";
import atomApp from "@/lib/hono-app";
import opsApp from "@/lib/hono-ops";

export const runtime = "nodejs";

// Parent app that mounts both Atomic API and Operations API
const app = new Hono();
app.route("/", atomApp);
app.route("/", opsApp);

const honoHandler = handle(app);

/**
 * Inject Clerk session token as Bearer header before passing to Hono.
 * Clerk's proxy sets auth context on the Next.js request,
 * but Hono reads Bearer tokens — this bridges the two.
 */
async function withClerkAuth(req: Request) {
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
