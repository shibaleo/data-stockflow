import { createApp } from "@/lib/create-app";
import { period } from "@/lib/db/schema";
import { requireAuth, requireTenant } from "@/middleware/guards";
import { periodResponseSchema, createPeriodSchema, updatePeriodSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import { getCurrent } from "@/lib/append-only";
import type { CurrentPeriod } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Periods", "periodId", periodResponseSchema, createPeriodSchema, updatePeriodSchema);

// ── Date range validation middleware ──

async function validateParentDateRange(
  parentKey: number | null | undefined,
  startDate: Date,
  endDate: Date,
  tenantKey: number,
): Promise<string | null> {
  if (!parentKey) return null;
  const parent = await getCurrent<CurrentPeriod>("current_period", {
    tenant_key: tenantKey, key: parentKey,
  });
  if (!parent) return "Parent period not found";
  const parentStart = parent.start_date instanceof Date ? parent.start_date : new Date(String(parent.start_date));
  const parentEnd = parent.end_date instanceof Date ? parent.end_date : new Date(String(parent.end_date));
  if (startDate < parentStart || endDate > parentEnd) {
    return "Child period must be within parent's date range";
  }
  return null;
}

// Validate on create
app.post("/", async (c, next) => {
  const body = await c.req.json();
  if (body.parent_period_id) {
    const err = await validateParentDateRange(
      body.parent_period_id,
      new Date(body.start_date),
      new Date(body.end_date),
      c.get("tenantKey"),
    );
    if (err) return c.json({ error: err }, 422);
  }
  await next();
});

// Validate on update
app.put("/:periodId", async (c, next) => {
  const body = await c.req.json();
  const periodKey = Number(c.req.param("periodId"));
  // Only validate if parent or dates are changing
  const hasParentChange = body.parent_period_id !== undefined;
  const hasDateChange = body.start_date || body.end_date;
  if (hasParentChange || hasDateChange) {
    const current = await getCurrent<CurrentPeriod>("current_period", {
      tenant_key: c.get("tenantKey"), key: periodKey,
    });
    if (current) {
      const parentKey = hasParentChange ? body.parent_period_id : current.parent_period_key;
      const startDate = body.start_date ? new Date(body.start_date) : (current.start_date instanceof Date ? current.start_date : new Date(String(current.start_date)));
      const endDate = body.end_date ? new Date(body.end_date) : (current.end_date instanceof Date ? current.end_date : new Date(String(current.end_date)));
      if (parentKey) {
        const err = await validateParentDateRange(parentKey, startDate, endDate, c.get("tenantKey"));
        if (err) return c.json({ error: err }, 422);
      }
    }
  }
  // Status transition validation
  if (body.status) {
    const current = await getCurrent<CurrentPeriod>("current_period", {
      tenant_key: c.get("tenantKey"), key: periodKey,
    });
    if (current?.status === "finalized") {
      return c.json({ error: "Cannot change status of a finalized period" }, 422);
    }
  }
  await next();
});

registerCrudHandlers<CurrentPeriod>(app, routes, {
  table: period, tableName: "period", viewName: "current_period", historyView: "history_period",
  entityType: "period", entityLabel: "期間", idParam: "periodId",
  mapRow: createMapper<CurrentPeriod>([], ["tenant_key", "parent_period_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    start_date: new Date(body.start_date as string), end_date: new Date(body.end_date as string),
    status: body.status ?? "open",
    parent_period_key: body.parent_period_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name, start_date: body.start_date, end_date: body.end_date }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    start_date: body.start_date ? new Date(body.start_date as string) : cur.start_date,
    end_date: body.end_date ? new Date(body.end_date as string) : cur.end_date,
    status: body.status ?? cur.status,
    parent_period_key: body.parent_period_id !== undefined ? body.parent_period_id : cur.parent_period_key,
    is_active: body.is_active ?? cur.is_active,
    created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({
    code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    start_date: body.start_date ?? String(cur.start_date),
    end_date: body.end_date ?? String(cur.end_date),
  }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code, name: cur.name,
    start_date: cur.start_date, end_date: cur.end_date,
    status: cur.status, parent_period_key: cur.parent_period_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name, start_date: String(cur.start_date), end_date: String(cur.end_date) }),
});

export default app;
