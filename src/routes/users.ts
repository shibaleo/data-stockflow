import { createApp } from "@/lib/create-app";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { listCurrent, getCurrent, getMaxRevision, listHistory } from "@/lib/append-only";
import { userResponseSchema, createUserSchema, updateUserSchema } from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { recordEvent } from "@/lib/event-log";
import { computeMasterHashes } from "@/lib/entity-hash";
import { createMapper, defineCrudRoutes } from "@/lib/crud-factory";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import type { CurrentUser } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

// Users support list, get, create, update, deactivate, history
const mapUser = createMapper<CurrentUser>([], ["tenant_key", "role_key"]);

const routes = defineCrudRoutes("Users", "userId", userResponseSchema, createUserSchema, updateUserSchema);

app.openapi(routes.list, async (c) => {
  const scope = c.get("userRole") === "platform" ? null : { tenant_key: c.get("tenantKey") };
  const rows = await listCurrent<CurrentUser>("current_user", scope);
  return c.json({ data: rows.map(mapUser) }, 200);
});

/** GET /users/me — current authenticated user */
app.get("/me", async (c) => {
  const row = await getCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey"), key: c.get("userKey") });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: mapUser(row) }, 200);
});

app.openapi(routes.get, async (c) => {
  const filter = c.get("userRole") === "platform"
    ? { key: Number(c.req.param("userId")) }
    : { tenant_key: c.get("tenantKey"), key: Number(c.req.param("userId")) };
  const row = await getCurrent<CurrentUser>("current_user", filter);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: mapUser(row) }, 200);
});

app.use(routes.create.getRoutingPath(), requireRole("admin"));
app.openapi(routes.create, async (c) => {
  const body = c.req.valid("json") as Record<string, unknown>;
  const email = body.email as string;
  const code = body.code as string;
  const name = body.name as string;

  // Check email uniqueness
  const existing = await getCurrent<CurrentUser>("current_user", { email });
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const hashes = computeMasterHashes({ email, role_key: String(body.role_id), code, name }, null);
  const [created] = await db.insert(user).values({
    email, tenant_key: c.get("tenantKey"),
    role_key: body.role_id as number, code, name, ...hashes,
  }).returning();
  recordAudit(c, { action: "create", entityType: "user", entityKey: created.key });
  recordEvent(c, {
    action: "create", entityType: "user", entityKey: created.key,
    entityName: name,
    summary: `ユーザー「${name}」を作成しました`,
  });
  return c.json({ data: mapUser(created as unknown as CurrentUser) }, 201);
});

app.use(routes.update.getRoutingPath(), requireRole("admin"));
app.openapi(routes.update, async (c) => {
  const userKey = Number(c.req.param("userId"));
  const body = c.req.valid("json") as Record<string, unknown>;

  // Cannot modify own role
  if (userKey === c.get("userKey") && body.role_id !== undefined) {
    return c.json({ error: "Cannot change own role" }, 403);
  }

  const current = await getCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey"), key: userKey });
  if (!current) return c.json({ error: "Not found" }, 404);
  const maxRev = await getMaxRevision("user", userKey);
  const newRoleKey = (body.role_id as number | undefined) ?? current.role_key;
  const newCode = (body.code as string | undefined) ?? current.code;
  const newName = (body.name as string | undefined) ?? current.name;
  const hashes = computeMasterHashes({ email: current.email, role_key: String(newRoleKey), code: newCode, name: newName }, current.revision_hash);
  const [updated] = await db.insert(user).values({
    key: userKey, revision: maxRev + 1,
    email: current.email, external_id: current.external_id,
    tenant_key: c.get("tenantKey"),
    role_key: newRoleKey, code: newCode, name: newName,
    is_active: current.is_active, ...hashes,
  }).returning();
  recordAudit(c, { action: "update", entityType: "user", entityKey: userKey, revision: maxRev + 1 });
  recordEvent(c, {
    action: "update", entityType: "user", entityKey: userKey,
    entityName: newName,
    summary: `ユーザー「${newName}」を更新しました`,
  });
  return c.json({ data: mapUser(updated as unknown as CurrentUser) }, 200);
});

app.use(routes.del.getRoutingPath(), requireRole("admin"));
app.openapi(routes.del, async (c) => {
  const userKey = Number(c.req.param("userId"));

  // Cannot deactivate yourself
  if (userKey === c.get("userKey")) {
    return c.json({ error: "Cannot deactivate yourself" }, 422);
  }

  const current = await getCurrent<CurrentUser>("current_user", { tenant_key: c.get("tenantKey"), key: userKey });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active === false) return c.json({ error: "Already deactivated" }, 422);

  const maxRev = await getMaxRevision("user", userKey);
  const hashes = computeMasterHashes(
    { email: current.email, role_key: String(current.role_key), code: current.code, name: current.name },
    current.revision_hash,
  );
  await db.insert(user).values({
    key: userKey, revision: maxRev + 1,
    email: current.email, external_id: current.external_id,
    tenant_key: c.get("tenantKey"),
    role_key: current.role_key, code: current.code, name: current.name,
    is_active: false, ...hashes,
  });
  recordAudit(c, { action: "deactivate", entityType: "user", entityKey: userKey, revision: maxRev + 1 });
  recordEvent(c, {
    action: "deactivate", entityType: "user", entityKey: userKey,
    entityName: current.name,
    summary: `ユーザー「${current.name}」を無効化しました`,
  });
  return c.json({ message: "Deactivated" }, 200);
});

app.openapi(routes.history, async (c) => {
  const rows = await listHistory<CurrentUser>("history_user", Number(c.req.param("userId")));
  return c.json({ data: rows.map(mapUser) }, 200);
});

// ============================================================
// API Key management (tenant-scoped, own keys only)
// ============================================================

/** GET /users/me/api-keys */
app.get("/me/api-keys", async (c) => {
  const userKey = c.get("userKey");
  if (!userKey) return c.json({ error: "Authentication required" }, 401);
  const keys = await listApiKeys(userKey);
  return c.json({ data: keys }, 200);
});

/** POST /users/me/api-keys */
app.post("/me/api-keys", async (c) => {
  const userKey = c.get("userKey");
  const tenantKey = c.get("tenantKey");
  const role = c.get("userRole");
  if (!userKey || !tenantKey) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{ name: string; expires_in_days?: number }>();
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);

  const expiresAt = body.expires_in_days
    ? new Date(Date.now() + body.expires_in_days * 86400_000)
    : null;

  const { rawKey, record } = await createApiKey({
    userKey, tenantKey, role, name: body.name.trim(), expiresAt,
  });

  recordAudit(c, { action: "create", entityType: "api_key", entityKey: 0, detail: `name=${record.name}` });
  recordEvent(c, {
    action: "create", entityType: "api_key", entityKey: 0,
    entityName: record.name,
    summary: `APIキー「${record.name}」を作成しました`,
  });
  return c.json({ data: { ...record, raw_key: rawKey } }, 201);
});

/** DELETE /users/me/api-keys/:keyId */
app.delete("/me/api-keys/:keyId", async (c) => {
  const userKey = c.get("userKey");
  if (!userKey) return c.json({ error: "Authentication required" }, 401);

  const keyId = c.req.param("keyId");
  const deleted = await revokeApiKey(keyId, userKey);
  if (!deleted) return c.json({ error: "Not found" }, 404);

  recordAudit(c, { action: "delete", entityType: "api_key", entityKey: 0, detail: `uuid=${keyId}` });
  recordEvent(c, {
    action: "delete", entityType: "api_key", entityKey: 0,
    summary: `APIキーを削除しました`,
  });
  return c.json({ message: "API key revoked" }, 200);
});

export default app;
