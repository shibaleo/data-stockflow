import { createApp } from "@/lib/create-app";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { listCurrent, getCurrent, getMaxRevision, listHistory } from "@/lib/append-only";
import { userResponseSchema, createUserSchema, updateUserSchema } from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { computeMasterHashes } from "@/lib/entity-hash";
import { createMapper, defineCrudRoutes } from "@/lib/crud-factory";
import type { CurrentUser } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

// Users don't have is_active / delete — only list, get, create, update, history
const mapUser = createMapper<CurrentUser>([], ["tenant_key", "role_key"]);

const routes = defineCrudRoutes("Users", "userId", userResponseSchema, createUserSchema, updateUserSchema);

app.openapi(routes.list, async (c) => {
  const rows = await listCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey") });
  return c.json({ data: rows.map(mapUser) }, 200);
});

app.openapi(routes.get, async (c) => {
  const row = await getCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey"), key: Number(c.req.param("userId")) });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: mapUser(row) }, 200);
});

app.use(routes.create.getRoutingPath(), requireRole("admin"));
app.openapi(routes.create, async (c) => {
  const body = c.req.valid("json") as Record<string, unknown>;
  const code = body.code as string;
  const name = body.name as string;
  const hashes = computeMasterHashes({ external_id: body.external_id, role_key: String(body.role_id), code, name }, null);
  const [created] = await db.insert(user).values({
    external_id: body.external_id as string, tenant_key: c.get("tenantKey"),
    role_key: body.role_id as number, code, name, ...hashes,
  }).returning();
  recordAudit(c, { action: "create", entityType: "user", entityKey: created.key });
  return c.json({ data: mapUser(created as unknown as CurrentUser) }, 201);
});

app.use(routes.update.getRoutingPath(), requireRole("admin"));
app.openapi(routes.update, async (c) => {
  const userKey = Number(c.req.param("userId"));
  const body = c.req.valid("json") as Record<string, unknown>;
  const current = await getCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey"), key: userKey });
  if (!current) return c.json({ error: "Not found" }, 404);
  const maxRev = await getMaxRevision("user", userKey);
  const newRoleKey = (body.role_id as number | undefined) ?? current.role_key;
  const newCode = (body.code as string | undefined) ?? current.code;
  const newName = (body.name as string | undefined) ?? current.name;
  const hashes = computeMasterHashes({ external_id: current.external_id, role_key: String(newRoleKey), code: newCode, name: newName }, current.revision_hash);
  const [updated] = await db.insert(user).values({
    key: userKey, revision: maxRev + 1,
    external_id: current.external_id, tenant_key: c.get("tenantKey"),
    role_key: newRoleKey, code: newCode, name: newName, ...hashes,
  }).returning();
  recordAudit(c, { action: "update", entityType: "user", entityKey: userKey, revision: maxRev + 1 });
  return c.json({ data: mapUser(updated as unknown as CurrentUser) }, 200);
});

app.openapi(routes.history, async (c) => {
  const rows = await listHistory<CurrentUser>("history_user", Number(c.req.param("userId")));
  return c.json({ data: rows.map(mapUser) }, 200);
});

export default app;
