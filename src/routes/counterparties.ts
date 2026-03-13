import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
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
  createCounterpartySchema,
  updateCounterpartySchema,
  counterpartyResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentCounterparty } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = new OpenAPIHono<{ Variables: AppVariables }>();
app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Counterparties"],
  summary: "List current counterparties",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(counterpartyResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Counterparties"],
  summary: "Get counterparty by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(counterpartyResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Counterparties"],
  summary: "Create counterparty",
  request: { body: { content: { "application/json": { schema: createCounterpartySchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(counterpartyResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["Counterparties"],
  summary: "Update counterparty (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateCounterpartySchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(counterpartyResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["Counterparties"],
  summary: "Deactivate counterparty",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{code}/restore",
  tags: ["Counterparties"],
  summary: "Restore counterparty",
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

  const rows = await listCurrent<CurrentCounterparty>("current_counterparty", { tenant_id: tenantId }, {
    limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined,
  });

  return c.json({ data: rows, next_cursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");
  const row = await getCurrent<CurrentCounterparty>("current_counterparty", { tenant_id: tenantId, code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin", "user"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const created = await prisma.counterparty.create({
    data: {
      tenant_id: tenantId, display_code: body.display_code, revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name,
      qualified_invoice_number: body.qualified_invoice_number,
      is_qualified_issuer: body.is_qualified_issuer,
    },
  });
  recordAudit(c, { action: "create", entityType: "counterparty", entityCode: created.code, revision: 1 });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin", "user"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentCounterparty>("current_counterparty", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Resource is inactive" }, 404);

  const maxRev = await getMaxRevision("counterparty", { tenant_id: tenantId, code });

  const updated = await prisma.counterparty.create({
    data: {
      tenant_id: tenantId, code,
      display_code: body.display_code !== undefined ? body.display_code : current.display_code,
      revision: maxRev + 1, valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name ?? current.name,
      qualified_invoice_number: body.qualified_invoice_number !== undefined
        ? body.qualified_invoice_number : current.qualified_invoice_number,
      is_qualified_issuer: body.is_qualified_issuer ?? current.is_qualified_issuer,
    },
  });
  recordAudit(c, { action: "update", entityType: "counterparty", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin", "user"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentCounterparty>("current_counterparty", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 404);

  const maxRev = await getMaxRevision("counterparty", { tenant_id: tenantId, code });
  await prisma.counterparty.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, is_active: false,
      qualified_invoice_number: current.qualified_invoice_number,
      is_qualified_issuer: current.is_qualified_issuer,
    },
  });
  recordAudit(c, { action: "deactivate", entityType: "counterparty", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin", "user"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentCounterparty>("current_counterparty", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 404);

  const maxRev = await getMaxRevision("counterparty", { tenant_id: tenantId, code });
  await prisma.counterparty.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, is_active: true,
      qualified_invoice_number: current.qualified_invoice_number,
      is_qualified_issuer: current.is_qualified_issuer,
    },
  });
  recordAudit(c, { action: "restore", entityType: "counterparty", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Restored" }, 200);
});

export default app;
