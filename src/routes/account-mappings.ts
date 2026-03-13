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
  idParamSchema,
  errorSchema,
  messageSchema,
  paginatedSchema,
  dataSchema,
  createAccountMappingSchema,
  updateAccountMappingSchema,
  accountMappingResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentAccountMapping, CurrentAccount } from "@/lib/types";

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["AccountMappings"],
  summary: "List current account mappings",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(accountMappingResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["AccountMappings"],
  summary: "Get account mapping by ID",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(accountMappingResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["AccountMappings"],
  summary: "Create account mapping",
  request: { body: { content: { "application/json": { schema: createAccountMappingSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(accountMappingResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{id}",
  tags: ["AccountMappings"],
  summary: "Update account mapping (new revision)",
  request: { params: idParamSchema, body: { content: { "application/json": { schema: updateAccountMappingSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(accountMappingResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    410: { description: "Gone (inactive)", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["AccountMappings"],
  summary: "Deactivate account mapping",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{id}/restore",
  tags: ["AccountMappings"],
  summary: "Restore account mapping",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Restored", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

// ---- Handlers ----

app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");
  const { limit: limitStr, cursor: cursorParam } = c.req.valid("query");
  const limit = Math.min(Number(limitStr || 50), 200);

  const rows = await listCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    { tenant_id: tenantId },
    { limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined }
  );

  return c.json({
    data: rows,
    next_cursor:
      rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { id } = c.req.valid("param");

  const row = await getCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    { tenant_id: tenantId, id }
  );
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const existing = await getCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    {
      tenant_id: tenantId,
      source_system: body.source_system,
      source_field: body.source_field,
      source_value: body.source_value,
      side: body.side,
    }
  );
  if (existing) return c.json({ error: "Mapping already exists" }, 409);

  const account = await getCurrent<CurrentAccount>("current_account", {
    tenant_id: tenantId,
    code: body.account_code,
  });
  if (!account) return c.json({ error: "account_code not found" }, 422);

  const created = await prisma.accountMapping.create({
    data: {
      tenant_id: tenantId,
      source_system: body.source_system,
      source_field: body.source_field,
      source_value: body.source_value,
      side: body.side,
      revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      account_code: body.account_code,
    },
  });

  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    { tenant_id: tenantId, id }
  );
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active)
    return c.json({ error: "Resource is inactive" }, 410);

  if (body.account_code) {
    const account = await getCurrent<CurrentAccount>("current_account", {
      tenant_id: tenantId,
      code: body.account_code,
    });
    if (!account) return c.json({ error: "account_code not found" }, 422);
  }

  const maxRev = await getMaxRevision("account_mapping", {
    tenant_id: tenantId,
    source_system: current.source_system,
    source_field: current.source_field,
    source_value: current.source_value,
    side: current.side,
  });

  const updated = await prisma.accountMapping.create({
    data: {
      tenant_id: tenantId,
      source_system: current.source_system,
      source_field: current.source_field,
      source_value: current.source_value,
      side: current.side,
      revision: maxRev + 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      account_code: body.account_code ?? current.account_code,
    },
  });

  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { id } = c.req.valid("param");

  const current = await getCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    { tenant_id: tenantId, id }
  );
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 409);

  const maxRev = await getMaxRevision("account_mapping", {
    tenant_id: tenantId,
    source_system: current.source_system,
    source_field: current.source_field,
    source_value: current.source_value,
    side: current.side,
  });

  await prisma.accountMapping.create({
    data: {
      tenant_id: tenantId,
      source_system: current.source_system,
      source_field: current.source_field,
      source_value: current.source_value,
      side: current.side,
      revision: maxRev + 1,
      created_by: userId,
      is_active: false,
      account_code: current.account_code,
    },
  });

  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { id } = c.req.valid("param");

  const current = await getCurrent<CurrentAccountMapping>(
    "current_account_mapping",
    { tenant_id: tenantId, id }
  );
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 409);

  const maxRev = await getMaxRevision("account_mapping", {
    tenant_id: tenantId,
    source_system: current.source_system,
    source_field: current.source_field,
    source_value: current.source_value,
    side: current.side,
  });

  await prisma.accountMapping.create({
    data: {
      tenant_id: tenantId,
      source_system: current.source_system,
      source_field: current.source_field,
      source_value: current.source_value,
      side: current.side,
      revision: maxRev + 1,
      created_by: userId,
      is_active: true,
      account_code: current.account_code,
    },
  });

  return c.json({ message: "Restored" }, 200);
});

export default app;
