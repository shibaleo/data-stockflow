import { createApp } from "@/lib/create-app";
import { book } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { bookResponseSchema, createBookSchema, updateBookSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentBook } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Books", "bookId", bookResponseSchema, createBookSchema, updateBookSchema);

registerCrudHandlers<CurrentBook>(app, routes, {
  table: book, tableName: "book", viewName: "current_book", historyView: "history_book",
  entityType: "book", idParam: "bookId",
  mapRow: createMapper<CurrentBook>(["tenant_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    unit: body.unit, unit_symbol: body.unit_symbol ?? "",
    unit_position: body.unit_position ?? "left",
    type_labels: body.type_labels ?? {},
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name, unit: body.unit }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name, unit: body.unit ?? cur.unit,
    unit_symbol: body.unit_symbol ?? cur.unit_symbol,
    unit_position: body.unit_position ?? cur.unit_position,
    type_labels: body.type_labels ?? (cur.type_labels as object),
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name, unit: body.unit ?? cur.unit }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, unit: cur.unit, unit_symbol: cur.unit_symbol,
    unit_position: cur.unit_position, type_labels: cur.type_labels as object,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name, unit: cur.unit }),
});

export default app;
