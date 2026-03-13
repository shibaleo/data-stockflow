import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
const roleSchema = z.enum(["platform", "tenant", "admin", "user"]);

export type UserRole = "platform" | "tenant" | "admin" | "user";

export type AppVariables = {
  tenantId: string;
  userId: string;
  userRole: UserRole;
};

export const contextMiddleware = createMiddleware<{
  Variables: AppVariables;
}>(async (c, next) => {
  const tenantId = c.req.header("X-Tenant-Id");
  const userId = c.req.header("X-User-Id");
  const role = c.req.header("X-User-Role");

  if (tenantId) {
    const parsed = uuidSchema.safeParse(tenantId);
    if (!parsed.success)
      throw new HTTPException(400, { message: "Invalid X-Tenant-Id" });
    c.set("tenantId", parsed.data);
  }

  if (userId) {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success)
      throw new HTTPException(400, { message: "Invalid X-User-Id" });
    c.set("userId", parsed.data);
  }

  if (role) {
    const parsed = roleSchema.safeParse(role);
    if (!parsed.success)
      throw new HTTPException(400, { message: "Invalid X-User-Role" });
    c.set("userRole", parsed.data);
  }

  await next();
});
