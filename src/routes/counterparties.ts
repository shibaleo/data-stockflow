import { createApp } from "@/lib/create-app";
import { counterparty } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { counterpartyResponseSchema, createCounterpartySchema, updateCounterpartySchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentCounterparty } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Counterparties", "counterpartyId", counterpartyResponseSchema, createCounterpartySchema, updateCounterpartySchema);

registerCrudHandlers<CurrentCounterparty>(app, routes, {
  table: counterparty, tableName: "counterparty", viewName: "current_counterparty", historyView: "history_counterparty",
  entityType: "counterparty", entityLabel: "取引先", idParam: "counterpartyId",
  mapRow: createMapper<CurrentCounterparty>(["tenant_key"], ["parent_counterparty_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    parent_counterparty_key: body.parent_counterparty_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    parent_counterparty_key: body.parent_counterparty_id !== undefined ? body.parent_counterparty_id : cur.parent_counterparty_key,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, parent_counterparty_key: cur.parent_counterparty_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
});

export default app;
