import { createApp } from "@/lib/create-app";
import { tenant } from "@/lib/db/schema";
import { requireAuth, requireRole } from "@/middleware/guards";
import { tenantResponseSchema, createTenantSchema, updateTenantSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentTenant } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth());

const routes = defineCrudRoutes("Tenants", "tenantId", tenantResponseSchema, createTenantSchema, updateTenantSchema);

registerCrudHandlers<CurrentTenant>(app, routes, {
  table: tenant, tableName: "tenant", viewName: "current_tenant", historyView: "history_tenant",
  entityType: "tenant", idParam: "tenantId",
  mapRow: createMapper<CurrentTenant>(),
  scope: () => null,
  buildCreate: (body) => ({ name: body.name }),
  hashCreate: (body) => ({ name: body.name }),
  buildUpdate: (body, cur) => ({
    name: body.name ?? cur.name,
    locked_until: body.locked_until !== undefined
      ? (body.locked_until ? new Date(body.locked_until as string) : null)
      : cur.locked_until,
  }),
  hashUpdate: (body, cur) => ({ name: body.name ?? cur.name }),
  buildDeactivate: (cur) => ({ name: cur.name, locked_until: cur.locked_until }),
  hashDeactivate: (cur) => ({ name: cur.name }),
  writeRoles: ["platform"],
});

export default app;
