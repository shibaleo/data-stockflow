import { createApp } from "@/lib/create-app";
import { period } from "@/lib/db/schema";
import { requireAuth, requireTenant } from "@/middleware/guards";
import { periodResponseSchema, createPeriodSchema, updatePeriodSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentPeriod } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Periods", "periodId", periodResponseSchema, createPeriodSchema, updatePeriodSchema);

registerCrudHandlers<CurrentPeriod>(app, routes, {
  table: period, tableName: "period", viewName: "current_period", historyView: "history_period",
  entityType: "period", entityLabel: "期間", idParam: "periodId",
  mapRow: createMapper<CurrentPeriod>([], ["tenant_key", "parent_period_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code,
    start_date: new Date(body.start_date as string), end_date: new Date(body.end_date as string),
    status: body.status ?? "open",
    parent_period_key: body.parent_period_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, start_date: body.start_date, end_date: body.end_date }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    start_date: body.start_date ? new Date(body.start_date as string) : cur.start_date,
    end_date: body.end_date ? new Date(body.end_date as string) : cur.end_date,
    status: body.status ?? cur.status,
    is_active: body.is_active ?? cur.is_active,
    created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({
    code: body.code ?? cur.code,
    start_date: body.start_date ?? String(cur.start_date),
    end_date: body.end_date ?? String(cur.end_date),
  }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    start_date: cur.start_date, end_date: cur.end_date,
    status: cur.status, parent_period_key: cur.parent_period_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, start_date: String(cur.start_date), end_date: String(cur.end_date) }),
});

export default app;
