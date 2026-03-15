import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { AppVariables, UserRole } from "./context";

const S = "data_stockflow";

export const requireTenant = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (c.get("tenantKey") == null) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    await next();
  });

export const requireAuth = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (c.get("tenantKey") == null || c.get("userKey") == null || !c.get("userRole")) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    await next();
  });

// platform role always has full access.
// Other roles must be explicitly listed in requireRole().
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const userRole = c.get("userRole");
    if (userRole === "platform" || roles.includes(userRole)) {
      await next();
      return;
    }
    throw new HTTPException(403, {
      message: `Required role: ${roles.join(" | ")}`,
    });
  });

/**
 * Resolve bookId path param → verify tenant ownership + active status.
 * Sets c.get("bookKey") for downstream handlers.
 */
export const requireBook = () =>
  createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const bookIdParam = c.req.param("bookId");
    if (!bookIdParam) {
      throw new HTTPException(400, { message: "bookId is required" });
    }
    const bookKey = Number(bookIdParam);
    if (!Number.isFinite(bookKey)) {
      throw new HTTPException(400, { message: "bookId must be a number" });
    }
    const tenantKey = c.get("tenantKey");
    const { rows } = await db.execute(sql`
      SELECT key, is_active FROM ${sql.raw(`"${S}".current_book`)}
      WHERE tenant_key = ${tenantKey} AND key = ${bookKey}
      LIMIT 1
    `);
    if (rows.length === 0) {
      throw new HTTPException(404, { message: "Book not found" });
    }
    if (!(rows[0] as { is_active: boolean }).is_active) {
      throw new HTTPException(410, { message: "Book is deactivated" });
    }
    c.set("bookKey", bookKey);
    await next();
  });

/**
 * Reject write operations for audit role.
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
