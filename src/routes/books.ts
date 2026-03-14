import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { book } from "@/lib/db/schema";
import {
  listCurrent,
  getCurrent,
  getMaxRevision,
} from "@/lib/append-only";
import {
  errorSchema,
  messageSchema,
  dataSchema,
  bookResponseSchema,
  createBookSchema,
  updateBookSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { z } from "@hono/zod-openapi";
import type { CurrentBook } from "@/lib/types";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

// ── Route definitions ──

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Books"],
  summary: "List books for current tenant (includes deactivated)",
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(bookResponseSchema) }),
        },
      },
    },
  },
});

const get = createRoute({
  method: "get",
  path: "/{bookCode}",
  tags: ["Books"],
  summary: "Get book by code",
  request: {
    params: z.object({
      bookCode: z.string().openapi({ example: "default" }),
    }),
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": { schema: dataSchema(bookResponseSchema) },
      },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Books"],
  summary: "Create a new book",
  request: {
    body: {
      content: { "application/json": { schema: createBookSchema } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": { schema: dataSchema(bookResponseSchema) },
      },
    },
    409: {
      description: "Conflict",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const update = createRoute({
  method: "put",
  path: "/{bookCode}",
  tags: ["Books"],
  summary: "Update a book (new revision)",
  request: {
    params: z.object({
      bookCode: z.string().openapi({ example: "default" }),
    }),
    body: {
      content: { "application/json": { schema: updateBookSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: {
        "application/json": { schema: dataSchema(bookResponseSchema) },
      },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    410: {
      description: "Deactivated",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const deactivate = createRoute({
  method: "delete",
  path: "/{bookCode}",
  tags: ["Books"],
  summary: "Deactivate a book",
  request: {
    params: z.object({
      bookCode: z.string().openapi({ example: "default" }),
    }),
  },
  responses: {
    200: {
      description: "Deactivated",
      content: { "application/json": { schema: messageSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Already deactivated",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const restore = createRoute({
  method: "post",
  path: "/{bookCode}/restore",
  tags: ["Books"],
  summary: "Restore a deactivated book",
  request: {
    params: z.object({
      bookCode: z.string().openapi({ example: "default" }),
    }),
  },
  responses: {
    200: {
      description: "Restored",
      content: { "application/json": { schema: messageSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Already active",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

// ── Handlers ──

app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");

  const rows = await listCurrent<CurrentBook>(
    "current_book",
    { tenant_id: tenantId },
    { limit: 200 }
  );

  return c.json({ data: rows }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { bookCode } = c.req.valid("param");

  const book = await getCurrent<CurrentBook>("current_book", {
    tenant_id: tenantId,
    code: bookCode,
  });

  if (!book) return c.json({ error: "Not found" }, 404);
  return c.json({ data: book }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  const [created] = await db.insert(book).values({
    tenant_id: tenantId,
    display_code: body.display_code ?? body.name,
    name: body.name,
    unit: body.unit,
    unit_symbol: body.unit_symbol ?? "",
    unit_position: body.unit_position ?? "left",
    type_labels: body.type_labels ?? {},
    created_by: userId,
  }).returning();

  recordAudit(c, {
    action: "create",
    entityType: "book",
    entityCode: created.code,
  });
  return c.json({
    data: {
      ...created,
      type_labels: created.type_labels as Record<string, string>,
    },
  }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { bookCode } = c.req.valid("param");
  const body = c.req.valid("json");

  const current = await getCurrent<CurrentBook>("current_book", {
    tenant_id: tenantId,
    code: bookCode,
  });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Book is deactivated" }, 410);

  const maxRev = await getMaxRevision("book", {
    tenant_id: tenantId,
    code: bookCode,
  });

  const [updated] = await db.insert(book).values({
    tenant_id: tenantId,
    code: bookCode,
    display_code: body.display_code ?? current.display_code,
    revision: maxRev + 1,
    name: body.name ?? current.name,
    unit: body.unit ?? current.unit,
    unit_symbol: body.unit_symbol ?? current.unit_symbol,
    unit_position: body.unit_position ?? current.unit_position,
    type_labels: body.type_labels ?? (current.type_labels as object),
    created_by: userId,
  }).returning();

  recordAudit(c, {
    action: "update",
    entityType: "book",
    entityCode: bookCode,
    revision: maxRev + 1,
  });
  return c.json({
    data: {
      ...updated,
      type_labels: updated.type_labels as Record<string, string>,
    },
  }, 200);
});

app.use(deactivate.getRoutingPath(), requireRole("admin"));
app.openapi(deactivate, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { bookCode } = c.req.valid("param");

  const current = await getCurrent<CurrentBook>("current_book", {
    tenant_id: tenantId,
    code: bookCode,
  });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already deactivated" }, 422);

  const maxRev = await getMaxRevision("book", {
    tenant_id: tenantId,
    code: bookCode,
  });

  await db.insert(book).values({
    tenant_id: tenantId,
    code: bookCode,
    display_code: current.display_code,
    revision: maxRev + 1,
    name: current.name,
    unit: current.unit,
    unit_symbol: current.unit_symbol,
    unit_position: current.unit_position,
    type_labels: current.type_labels as object,
    is_active: false,
    created_by: userId,
  });

  recordAudit(c, {
    action: "deactivate",
    entityType: "book",
    entityCode: bookCode,
    revision: maxRev + 1,
  });
  return c.json({ message: "Deactivated" }, 200);
});

app.use(restore.getRoutingPath(), requireRole("admin"));
app.openapi(restore, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { bookCode } = c.req.valid("param");

  const current = await getCurrent<CurrentBook>("current_book", {
    tenant_id: tenantId,
    code: bookCode,
  });
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.is_active) return c.json({ error: "Already active" }, 422);

  const maxRev = await getMaxRevision("book", {
    tenant_id: tenantId,
    code: bookCode,
  });

  await db.insert(book).values({
    tenant_id: tenantId,
    code: bookCode,
    display_code: current.display_code,
    revision: maxRev + 1,
    name: current.name,
    unit: current.unit,
    unit_symbol: current.unit_symbol,
    unit_position: current.unit_position,
    type_labels: current.type_labels as object,
    is_active: true,
    created_by: userId,
  });

  recordAudit(c, {
    action: "restore",
    entityType: "book",
    entityCode: bookCode,
    revision: maxRev + 1,
  });
  return c.json({ message: "Restored" }, 200);
});

export default app;
