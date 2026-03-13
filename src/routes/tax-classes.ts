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
  createTaxClassSchema,
  updateTaxClassSchema,
  taxClassResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireAuth, requireRole } from "@/middleware/guards";
import type { CurrentTaxClass } from "@/lib/types";

const app = new OpenAPIHono<{ Variables: AppVariables }>();

// TaxClass is global (no tenant_id). Read = any auth, Write = platform only.
app.use("*", requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["TaxClasses"],
  summary: "List current tax classes",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(taxClassResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["TaxClasses"],
  summary: "Get tax class by code",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(taxClassResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["TaxClasses"],
  summary: "Create tax class",
  request: { body: { content: { "application/json": { schema: createTaxClassSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(taxClassResponseSchema) } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["TaxClasses"],
  summary: "Update tax class (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateTaxClassSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(taxClassResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    410: { description: "Gone (inactive)", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["TaxClasses"],
  summary: "Deactivate tax class",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

// ---- Handlers ----

app.openapi(list, async (c) => {
  const { limit: limitStr, cursor: cursorParam } = c.req.valid("query");
  const limit = Math.min(Number(limitStr || 50), 200);

  const rows = await listCurrent<CurrentTaxClass>(
    "current_tax_class",
    null, // no tenant filter
    { limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined }
  );

  return c.json({
    data: rows,
    next_cursor:
      rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  }, 200);
});

app.openapi(get, async (c) => {
  const { code } = c.req.valid("param");

  const row = await getCurrent<CurrentTaxClass>("current_tax_class", { code });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row }, 200);
});

app.use(create.getRoutingPath(), requireRole("platform"));
app.openapi(create, async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const existing = await getCurrent<CurrentTaxClass>("current_tax_class", {
    code: body.code,
  });
  if (existing) return c.json({ error: "Code already exists" }, 409);

  const created = await prisma.taxClass.create({
    data: {
      code: body.code,
      display_code: body.display_code,
      revision: 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      name: body.name,
      direction: body.direction,
      is_taxable: body.is_taxable,
      deduction_ratio: body.deduction_ratio,
      invoice_type: body.invoice_type,
    },
  });

  return c.json({ data: created }, 201);
});

app.use(update.getRoutingPath(), requireRole("platform"));
app.openapi(update, async (c) => {
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentTaxClass>("current_tax_class", {
    code,
  });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active)
    return c.json({ error: "Resource is inactive" }, 410);

  const maxRev = await getMaxRevision("tax_class", { code });

  const updated = await prisma.taxClass.create({
    data: {
      code,
      display_code:
        body.display_code !== undefined
          ? body.display_code
          : current.display_code,
      revision: maxRev + 1,
      valid_from: body.valid_from ? new Date(body.valid_from) : undefined,
      created_by: userId,
      name: body.name ?? current.name,
      direction:
        body.direction !== undefined ? body.direction : current.direction,
      is_taxable: body.is_taxable ?? current.is_taxable,
      deduction_ratio:
        body.deduction_ratio !== undefined
          ? body.deduction_ratio
          : current.deduction_ratio
            ? Number(current.deduction_ratio)
            : null,
      invoice_type:
        body.invoice_type !== undefined
          ? body.invoice_type
          : current.invoice_type,
    },
  });

  return c.json({ data: updated }, 200);
});

app.use(del.getRoutingPath(), requireRole("platform"));
app.openapi(del, async (c) => {
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentTaxClass>("current_tax_class", {
    code,
  });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already inactive" }, 409);

  const maxRev = await getMaxRevision("tax_class", { code });

  await prisma.taxClass.create({
    data: {
      code,
      display_code: current.display_code,
      revision: maxRev + 1,
      created_by: userId,
      name: current.name,
      is_active: false,
      direction: current.direction,
      is_taxable: current.is_taxable,
      deduction_ratio: current.deduction_ratio
        ? Number(current.deduction_ratio)
        : null,
      invoice_type: current.invoice_type,
    },
  });

  return c.json({ message: "Deactivated" }, 200);
});

// No restore for TaxClass (platform deactivation is final)

export default app;
