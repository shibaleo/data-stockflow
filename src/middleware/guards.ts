import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppVariables, UserRole } from "./context";

export const requireTenant = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get("tenantId")) {
      throw new HTTPException(400, { message: "X-Tenant-Id is required" });
    }
    await next();
  });

export const requireAuth = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get("userId")) {
      throw new HTTPException(401, { message: "X-User-Id is required" });
    }
    if (!c.get("userRole")) {
      throw new HTTPException(401, { message: "X-User-Role is required" });
    }
    await next();
  });

export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const userRole = c.get("userRole");
    if (!roles.includes(userRole)) {
      throw new HTTPException(403, {
        message: `Required role: ${roles.join(" | ")}`,
      });
    }
    await next();
  });
