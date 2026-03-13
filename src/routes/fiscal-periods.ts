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
  paginatedSchema,
  dataSchema,
  createFiscalPeriodSchema,
  updateFiscalPeriodSchema,
  fiscalPeriodResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentFiscalPeriod } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const app = new OpenAPIHono<{ Variables: AppVariables }>();
app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["FiscalPeriods"],
  summary: "List current fiscal periods",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(fiscalPeriodResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["FiscalPeriods"],
  summary: "Get fiscal period by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(fiscalPeriodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["FiscalPeriods"],
  summary: "Create fiscal period",
  request: { body: { content: { "application/json": { schema: createFiscalPeriodSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(fiscalPeriodResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["FiscalPeriods"],
  summary: "Update fiscal period (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateFiscalPeriodSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(fiscalPeriodResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

// FiscalPeriod has no is_active -- use status transitions instead
// No DELETE/RESTORE for fiscal periods

// ---- Handlers ----

app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");
  const { limit: limitStr, cursor: cursorParam } = c.req.valid("query");
  const limit = Math.min(Number(limitStr || 50), 200);

  const rows = await listCurrent<CurrentFiscalPeriod>("current_fiscal_period", { tenant_id: tenantId }, {
    limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined,
  });

  return c.json({ data: rows, next_cursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");
  const row = await getCurrent<CurrentFiscalPeriod>("current_fiscal_period", { tenant_id: tenantId, code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const created = await prisma.fiscalPeriod.create({
    data: {
      tenant_id: tenantId, display_code: body.display_code, revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId, fiscal_year: body.fiscal_year, period_no: body.period_no,
      start_date: new Date(body.start_date), end_date: new Date(body.end_date),
      status: body.status,
    },
  });
  recordAudit(c, { action: "create", entityType: "fiscal_period", entityCode: created.code, revision: 1 });
  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentFiscalPeriod>("current_fiscal_period", { tenant_id: tenantId, code });
  if (!current) return c.json({ error: "Not found" }, 404);

  const maxRev = await getMaxRevision("fiscal_period", { tenant_id: tenantId, code });

  const updated = await prisma.fiscalPeriod.create({
    data: {
      tenant_id: tenantId, code,
      display_code: body.display_code !== undefined ? body.display_code : current.display_code,
      revision: maxRev + 1, valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      fiscal_year: body.fiscal_year ?? current.fiscal_year,
      period_no: body.period_no ?? current.period_no,
      start_date: body.start_date ? new Date(body.start_date) : current.start_date,
      end_date: body.end_date ? new Date(body.end_date) : current.end_date,
      status: body.status ?? current.status,
    },
  });
  recordAudit(c, { action: "update", entityType: "fiscal_period", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: updated }, 200);
});

export default app;
