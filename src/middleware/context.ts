import { createMiddleware } from "hono/factory";
import { authenticate } from "@/lib/auth";

export type UserRole = "platform" | "audit" | "tenant" | "admin" | "user";

export type AppVariables = {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  bookCode: string;
};

export const contextMiddleware = createMiddleware<{
  Variables: AppVariables;
}>(async (c, next) => {
  try {
    const result = await authenticate(c.req.raw);
    if (result) {
      c.set("tenantId", result.tenantId);
      c.set("userId", result.userId);
      c.set("userRole", result.role);
    }
  } catch (e) {
    console.error("[contextMiddleware] authenticate error:", e);
  }
  await next();
});
