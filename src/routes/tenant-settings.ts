import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import { getCurrent, getMaxRevision } from "@/lib/append-only";
import {
  errorSchema,
  dataSchema,
  createTenantSettingSchema,
  updateTenantSettingSchema,
  tenantSettingResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentTenantSetting } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = createApp();

// TenantSetting: single resource per tenant. Write = tenant role only.
app.use("*", requireTenant(), requireAuth());

const get = createRoute({
  method: "get",
  path: "/",
  tags: ["TenantSettings"],
  summary: "Get tenant setting",
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(tenantSettingResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["TenantSettings"],
  summary: "Create tenant setting",
  request: { body: { content: { "application/json": { schema: createTenantSettingSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(tenantSettingResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/",
  tags: ["TenantSettings"],
  summary: "Update tenant setting (new revision)",
  request: { body: { content: { "application/json": { schema: updateTenantSettingSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(tenantSettingResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

// ---- Handlers ----

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");

  const row = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("tenant"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const existing = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (existing) return c.json({ error: "Setting already exists" }, 409);

  const created = await prisma.tenantSetting.create({
    data: {
      tenant_id: tenantId,
      revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      locked_until: body.locked_until ? new Date(body.locked_until) : null,
    },
  });

  recordAudit(c, { action: "create", entityType: "tenant_setting", entityCode: tenantId, revision: 1 });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("tenant"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (!current) return c.json({ error: "Not found" }, 404);

  const maxRev = await getMaxRevision("tenant_setting", {
    tenant_id: tenantId,
  });

  const updated = await prisma.tenantSetting.create({
    data: {
      tenant_id: tenantId,
      revision: maxRev + 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      locked_until:
        body.locked_until !== undefined
          ? body.locked_until
            ? new Date(body.locked_until)
            : null
          : current.locked_until,
    },
  });

  recordAudit(c, { action: "update", entityType: "tenant_setting", entityCode: tenantId, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

// No DELETE/RESTORE for TenantSetting

export default app;
