import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppVariables, UserRole } from "./context";

export const requireTenant = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get("tenantId")) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    await next();
  });

export const requireAuth = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get("tenantId") || !c.get("userId") || !c.get("userRole")) {
      throw new HTTPException(401, { message: "Authentication required" });
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

/**
 * Reject write operations (POST/PUT/DELETE/PATCH) for audit role.
 * Audit users can only read data.
 */
export const requireWritable = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (
      c.get("userRole") === "audit" &&
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      c.req.method !== "OPTIONS"
    ) {
      throw new HTTPException(403, {
        message: "Audit role is read-only",
      });
    }
    await next();
  });
