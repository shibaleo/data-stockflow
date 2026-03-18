import { createMiddleware } from "hono/factory";
import { authenticate } from "@/lib/auth";

export type UserRole = "platform" | "tenant" | "admin" | "user" | "auditor";

export type AppVariables = {
  tenantKey: number;
  userKey: number;
  userRole: UserRole;
  userName: string;
  roleKey: number;
  bookKey: number;
};

export const contextMiddleware = createMiddleware<{
  Variables: AppVariables;
}>(async (c, next) => {
  try {
    const result = await authenticate(c.req.raw);
    if (result) {
      c.set("tenantKey", result.tenantKey);
      c.set("userKey", result.userKey);
      c.set("userRole", result.role);
      c.set("userName", result.userName);
      c.set("roleKey", result.roleKey);
    }
  } catch (e) {
    console.error("[contextMiddleware] authenticate error:", e);
  }
  await next();
});
