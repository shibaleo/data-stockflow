import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
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
 * Resolve bookCode path param → verify tenant ownership + active status.
 * Sets c.get("bookCode") for downstream handlers.
 */
export const requireBook = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const bookCode = c.req.param("bookCode");
    if (!bookCode) {
      throw new HTTPException(400, { message: "bookCode is required" });
    }
    const tenantId = c.get("tenantId");
    const { rows } = await db.execute(sql`
      SELECT code, is_active FROM "data_stockflow"."current_book"
      WHERE tenant_id = ${tenantId} AND code = ${bookCode}
      LIMIT 1
    `);
    if (rows.length === 0) {
      throw new HTTPException(404, { message: "Book not found" });
    }
    if (!rows[0].is_active) {
      throw new HTTPException(410, { message: "Book is deactivated" });
    }
    c.set("bookCode", bookCode);
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
