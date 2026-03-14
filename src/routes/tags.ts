import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import {
  listCurrent,
  getCurrent,
  getMaxRevision,
  decodeCursor,
  encodeCursor,
} from "@/lib/append-only";
import {
  listQuerySchema,
  codeParamSchema,
  errorSchema,
  messageSchema,
  paginatedSchema,
  dataSchema,
  createTagSchema,
  updateTagSchema,
  tagResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentTag } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Tags"],
  summary: "List current tags",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(tagResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Tags"],
  summary: "Get tag by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(tagResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Tags"],
  summary: "Create tag",
  request: { body: { content: { "application/json": { schema: createTagSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(tagResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["Tags"],
  summary: "Update tag (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateTagSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(tagResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["Tags"],
  summary: "Deactivate tag",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{code}/restore",
  tags: ["Tags"],
  summary: "Restore tag",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Restored", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

// ---- Handlers ----

app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");
  const { limit: limitStr, cursor: cursorParam } = c.req.valid("query");
  const limit = Math.min(Number(limitStr || 50), 200);

  const rows = await listCurrent<CurrentTag>("current_tag", { tenant_id: tenantId }, {
    limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined,
  });

  return c.json({ data: rows, next_cursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");
  const row = await getCurrent<CurrentTag>("current_tag", { tenant_id: tenantId, code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin", "user"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const created = await prisma.tag.create({
    data: {
      tenant_id: tenantId, display_code: body.display_code, revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name, tag_type: body.tag_type,
    },
  });
  recordAudit(c, { action: "create", entityType: "tag", entityCode: created.code, revision: 1 });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin", "user"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentTag>("current_tag", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Resource is inactive" }, 404);

  const maxRev = await getMaxRevision("tag", { tenant_id: tenantId, code });

  const updated = await prisma.tag.create({
    data: {
      tenant_id: tenantId, code,
      display_code: body.display_code !== undefined ? body.display_code : current.display_code,
      revision: maxRev + 1, valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name ?? current.name,
      tag_type: body.tag_type ?? current.tag_type,
    },
  });
  recordAudit(c, { action: "update", entityType: "tag", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin", "user"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentTag>("current_tag", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 404);

  const maxRev = await getMaxRevision("tag", { tenant_id: tenantId, code });
  await prisma.tag.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, tag_type: current.tag_type, is_active: false,
    },
  });
  recordAudit(c, { action: "deactivate", entityType: "tag", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin", "user"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentTag>("current_tag", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 404);

  const maxRev = await getMaxRevision("tag", { tenant_id: tenantId, code });
  await prisma.tag.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, tag_type: current.tag_type, is_active: true,
    },
  });
  recordAudit(c, { action: "restore", entityType: "tag", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Restored" }, 200);
});

export default app;
