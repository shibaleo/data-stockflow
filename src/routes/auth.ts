import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { signToken } from "@/lib/auth";
import type { UserRole } from "@/middleware/context";

const S = "data_stockflow";
const app = new Hono();

const ROLES: readonly string[] = ["platform", "admin", "user", "auditor"];

/**
 * POST /api/v1/auth/login
 * Email + password authentication.
 * Sets __local_session httpOnly cookie on success.
 */
app.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  // Look up user by email
  const { rows } = await db.execute(sql`
    SELECT u.key, u.tenant_key, u.role_key, u.name, r.code as role_code
    FROM ${sql.raw(`"${S}".current_user`)} u
    JOIN ${sql.raw(`"${S}".current_role`)} r ON r.key = u.role_key
    WHERE u.email = ${body.email}
    LIMIT 1
  `);
  if (rows.length === 0) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const user = rows[0] as {
    key: number; tenant_key: number; role_key: number; name: string; role_code: string;
  };

  // Verify password
  const { rows: creds } = await db.execute(sql`
    SELECT password_hash
    FROM ${sql.raw(`"${S}".user_credential`)}
    WHERE user_key = ${user.key}
  `);
  if (creds.length === 0) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await bcrypt.compare(
    body.password,
    (creds[0] as { password_hash: string }).password_hash
  );
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  // Issue HS256 JWT session token
  const token = await signToken(
    user.key,
    user.tenant_key,
    user.role_code as UserRole
  );

  c.header(
    "Set-Cookie",
    `__local_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );

  return c.json({
    data: { id: user.key, name: user.name, role: user.role_code },
  });
});

/**
 * POST /api/v1/auth/logout
 * Clears the __local_session cookie.
 */
app.post("/logout", async (c) => {
  c.header(
    "Set-Cookie",
    "__local_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  return c.json({ message: "Logged out" });
});

/**
 * POST /api/v1/auth/token
 * Development token generation endpoint.
 * Protected by X-Auth-Secret header.
 */
app.post("/token", async (c) => {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return c.json({ error: "AUTH_SECRET is not configured" }, 500);
  }

  const headerSecret = c.req.header("X-Auth-Secret");
  if (headerSecret !== authSecret) {
    return c.json({ error: "Invalid auth secret" }, 401);
  }

  const body = await c.req.json<{
    user_id?: string;
    tenant_id?: string;
    role?: string;
  }>();

  if (!body.user_id || !body.tenant_id || !body.role) {
    return c.json(
      { error: "user_id, tenant_id, and role are required" },
      400
    );
  }

  if (!ROLES.includes(body.role)) {
    return c.json(
      { error: `Invalid role. Must be one of: ${ROLES.join(", ")}` },
      400
    );
  }

  const token = await signToken(
    Number(body.user_id),
    Number(body.tenant_id),
    body.role as UserRole
  );

  return c.json({ token, expires_in: 86400 }, 200);
});

export default app;
