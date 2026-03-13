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
  createAccountSchema,
  updateAccountSchema,
  accountResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentAccount } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = new OpenAPIHono<{ Variables: AppVariables }>();
app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Accounts"],
  summary: "List current accounts",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(accountResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Accounts"],
  summary: "Get account by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(accountResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Accounts"],
  summary: "Create account",
  request: { body: { content: { "application/json": { schema: createAccountSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(accountResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["Accounts"],
  summary: "Update account (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateAccountSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(accountResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["Accounts"],
  summary: "Deactivate account",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{code}/restore",
  tags: ["Accounts"],
  summary: "Restore account",
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

  const rows = await listCurrent<CurrentAccount>("current_account", { tenant_id: tenantId }, {
    limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined,
  });

  return c.json({ data: rows, next_cursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");
  const row = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  if (body.parent_account_code) {
    const parent = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code: body.parent_account_code });
    if (!parent) return c.json({ error: "parent_account_code not found" }, 422);
  }

  const created = await prisma.account.create({
    data: {
      tenant_id: tenantId, display_code: body.display_code, revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name, unit: body.unit, account_type: body.account_type,
      sign: body.sign, parent_account_code: body.parent_account_code,
    },
  });
  recordAudit(c, { action: "create", entityType: "account", entityCode: created.code, revision: 1 });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Resource is inactive" }, 404);

  if (body.parent_account_code !== undefined && body.parent_account_code !== null) {
    const parent = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code: body.parent_account_code });
    if (!parent) return c.json({ error: "parent_account_code not found" }, 422);
  }

  const maxRev = await getMaxRevision("account", { tenant_id: tenantId, code });
  const updated = await prisma.account.create({
    data: {
      tenant_id: tenantId, code,
      display_code: body.display_code !== undefined ? body.display_code : current.display_code,
      revision: maxRev + 1, valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name ?? current.name, unit: body.unit ?? current.unit,
      account_type: body.account_type ?? current.account_type, sign: body.sign ?? current.sign,
      parent_account_code: body.parent_account_code !== undefined ? body.parent_account_code : current.parent_account_code,
    },
  });
  recordAudit(c, { action: "update", entityType: "account", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 404);

  const maxRev = await getMaxRevision("account", { tenant_id: tenantId, code });
  await prisma.account.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, unit: current.unit, is_active: false,
      account_type: current.account_type, sign: current.sign, parent_account_code: current.parent_account_code,
    },
  });
  recordAudit(c, { action: "deactivate", entityType: "account", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentAccount>("current_account", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 404);

  const maxRev = await getMaxRevision("account", { tenant_id: tenantId, code });
  await prisma.account.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name, unit: current.unit, is_active: true,
      account_type: current.account_type, sign: current.sign, parent_account_code: current.parent_account_code,
    },
  });
  recordAudit(c, { action: "restore", entityType: "account", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Restored" }, 200);
});

export default app;
