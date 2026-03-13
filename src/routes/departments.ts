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
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentDepartment } from "@/lib/types";

const app = new OpenAPIHono<{ Variables: AppVariables }>();
app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Departments"],
  summary: "List current departments",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(departmentResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Departments"],
  summary: "Get department by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(departmentResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Departments"],
  summary: "Create department",
  request: { body: { content: { "application/json": { schema: createDepartmentSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(departmentResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["Departments"],
  summary: "Update department (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateDepartmentSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(departmentResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["Departments"],
  summary: "Deactivate department",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{code}/restore",
  tags: ["Departments"],
  summary: "Restore department",
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

  const rows = await listCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId }, {
    limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined,
  });

  return c.json({ data: rows, next_cursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");
  const row = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const existing = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code: body.code });
  if (existing) return c.json({ error: "Code already exists" }, 409);

  if (body.parent_department_code) {
    const parent = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code: body.parent_department_code });
    if (!parent) return c.json({ error: "parent_department_code not found" }, 422);
  }

  const created = await prisma.department.create({
    data: {
      tenant_id: tenantId, code: body.code, display_code: body.display_code, revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name,
      parent_department_code: body.parent_department_code,
      department_type: body.department_type,
    },
  });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Resource is inactive" }, 404);

  if (body.parent_department_code !== undefined && body.parent_department_code !== null) {
    const parent = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code: body.parent_department_code });
    if (!parent) return c.json({ error: "parent_department_code not found" }, 422);
  }

  const maxRev = await getMaxRevision("department", { tenant_id: tenantId, code });

  const updated = await prisma.department.create({
    data: {
      tenant_id: tenantId, code,
      display_code: body.display_code !== undefined ? body.display_code : current.display_code,
      revision: maxRev + 1, valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, name: body.name ?? current.name,
      parent_department_code: body.parent_department_code !== undefined
        ? body.parent_department_code : current.parent_department_code,
      department_type: body.department_type !== undefined
        ? body.department_type : current.department_type,
    },
  });
  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 404);

  const maxRev = await getMaxRevision("department", { tenant_id: tenantId, code });
  await prisma.department.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name,
      parent_department_code: current.parent_department_code,
      department_type: current.department_type, is_active: false,
    },
  });
  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentDepartment>("current_department", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 404);

  const maxRev = await getMaxRevision("department", { tenant_id: tenantId, code });
  await prisma.department.create({
    data: {
      tenant_id: tenantId, code, display_code: current.display_code, revision: maxRev + 1,
      created_by: userId, name: current.name,
      parent_department_code: current.parent_department_code,
      department_type: current.department_type, is_active: true,
    },
  });
  return c.json({ message: "Restored" }, 200);
});

export default app;
