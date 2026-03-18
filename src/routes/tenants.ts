import { createApp } from "@/lib/create-app";
import { tenant, user } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/middleware/guards";
import { tenantResponseSchema, createTenantSchema, updateTenantSchema, userResponseSchema, createUserSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import { listCurrent, getCurrent } from "@/lib/append-only";
import { computeMasterHashes } from "@/lib/entity-hash";
import { recordAudit } from "@/lib/audit";
import { recordEvent } from "@/lib/event-log";
import { createRoute, z } from "@hono/zod-openapi";
import type { CurrentTenant, CurrentUser } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth());

const routes = defineCrudRoutes("Tenants", "tenantId", tenantResponseSchema, createTenantSchema, updateTenantSchema);

registerCrudHandlers<CurrentTenant>(app, routes, {
  table: tenant, tableName: "tenant", viewName: "current_tenant", historyView: "history_tenant",
  entityType: "tenant", entityLabel: "テナント", idParam: "tenantId",
  mapRow: createMapper<CurrentTenant>(),
  scope: () => null,
  buildCreate: (body) => ({ name: body.name }),
  hashCreate: (body) => ({ name: body.name }),
  buildUpdate: (body, cur) => ({
    name: body.name ?? cur.name,
    locked_until: body.locked_until !== undefined
      ? (body.locked_until ? new Date(body.locked_until as string) : null)
      : cur.locked_until,
  }),
  hashUpdate: (body, cur) => ({ name: body.name ?? cur.name }),
  buildDeactivate: (cur) => ({ name: cur.name, locked_until: cur.locked_until }),
  hashDeactivate: (cur) => ({ name: cur.name }),
});

// ============================================================
// Platform-scoped user management: /tenants/:tenantId/users
// Pre-register users into a specific tenant (invitation flow)
// ============================================================

type UserResponse = z.infer<typeof userResponseSchema>;

const rawMapUser = createMapper<CurrentUser>([], ["tenant_key", "role_key"]);
const mapUser = (row: CurrentUser): UserResponse => rawMapUser(row) as UserResponse;
const tenantIdParam = z.object({ tenantId: z.string() });

const jc = <T extends z.ZodType>(schema: T) => ({
  content: { "application/json": { schema } },
});

// LIST users in a tenant
const listTenantUsers = createRoute({
  method: "get" as const, path: "/{tenantId}/users",
  tags: ["Tenants"], summary: "List users in tenant",
  request: { params: tenantIdParam },
  responses: {
    200: { description: "Success", ...jc(z.object({ data: z.array(userResponseSchema) })) },
    404: { description: "Tenant not found", ...jc(z.object({ error: z.string() })) },
  },
});

app.use(listTenantUsers.getRoutingPath(), requireRole("platform"));
app.openapi(listTenantUsers, async (c) => {
  const tenantKey = Number(c.req.param("tenantId"));
  const t = await getCurrent<CurrentTenant>("current_tenant", { key: tenantKey });
  if (!t) return c.json({ error: "Tenant not found" }, 404);
  const rows = await listCurrent<CurrentUser>("current_user", { tenant_key: tenantKey });
  return c.json({ data: rows.map(mapUser) }, 200);
});

// CREATE user in a tenant (pre-registration / invitation)
const createTenantUser = createRoute({
  method: "post" as const, path: "/{tenantId}/users",
  tags: ["Tenants"], summary: "Register user in tenant",
  request: { params: tenantIdParam, body: jc(createUserSchema) },
  responses: {
    201: { description: "Created", ...jc(z.object({ data: userResponseSchema })) },
    404: { description: "Tenant not found", ...jc(z.object({ error: z.string() })) },
    409: { description: "User already exists", ...jc(z.object({ error: z.string() })) },
  },
});

app.use(createTenantUser.getRoutingPath(), requireRole("platform"));
app.openapi(createTenantUser, async (c) => {
  const tenantKey = Number(c.req.param("tenantId"));
  const t = await getCurrent<CurrentTenant>("current_tenant", { key: tenantKey });
  if (!t) return c.json({ error: "Tenant not found" }, 404);

  const body = c.req.valid("json") as Record<string, unknown>;
  const email = body.email as string;
  const code = body.code as string;
  const name = body.name as string;
  const roleKey = body.role_id as number;

  // Check if email already exists (one email = one user across all tenants)
  const existing = await getCurrent<CurrentUser>("current_user", { email });
  if (existing) return c.json({ error: "User already registered" }, 409);

  const hashes = computeMasterHashes({ email, role_key: String(roleKey), code, name }, null);
  const [created] = await db.insert(user).values({
    email, tenant_key: tenantKey,
    role_key: roleKey, code, name, ...hashes,
  }).returning();

  recordAudit(c, { action: "create", entityType: "user", entityKey: created.key });
  recordEvent(c, {
    action: "create", entityType: "user", entityKey: created.key,
    entityName: name,
    summary: `ユーザー「${name}」を作成しました`,
  });
  return c.json({ data: mapUser(created as unknown as CurrentUser) }, 201);
});

export default app;
