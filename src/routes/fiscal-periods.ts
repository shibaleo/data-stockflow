import { createApp } from "@/lib/create-app";
import { fiscalPeriod } from "@/lib/db/schema";
import { requireAuth, requireBook } from "@/middleware/guards";
import { fiscalPeriodResponseSchema, createFiscalPeriodSchema, updateFiscalPeriodSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentFiscalPeriod } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth(), requireBook());

const routes = defineCrudRoutes("FiscalPeriods", "periodId", fiscalPeriodResponseSchema, createFiscalPeriodSchema, updateFiscalPeriodSchema);

registerCrudHandlers<CurrentFiscalPeriod>(app, routes, {
  table: fiscalPeriod, tableName: "fiscal_period", viewName: "current_fiscal_period", historyView: "history_fiscal_period",
  entityType: "fiscal_period", idParam: "periodId",
  mapRow: createMapper<CurrentFiscalPeriod>([], ["book_key", "parent_period_key"]),
  scope: (c) => ({ book_key: c.get("bookKey") }),
  buildCreate: (body, c) => ({
    book_key: c.get("bookKey"), code: body.code,
    start_date: new Date(body.start_date as string), end_date: new Date(body.end_date as string),
    status: body.status ?? "open",
    parent_period_key: body.parent_period_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, start_date: body.start_date, end_date: body.end_date }),
  buildUpdate: (body, cur, c) => ({
    book_key: c.get("bookKey"), code: body.code ?? cur.code,
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
    book_key: c.get("bookKey"), code: cur.code,
    start_date: cur.start_date, end_date: cur.end_date,
    status: cur.status, parent_period_key: cur.parent_period_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, start_date: String(cur.start_date), end_date: String(cur.end_date) }),
});

export default app;
