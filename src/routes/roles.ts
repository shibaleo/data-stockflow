import { createApp } from "@/lib/create-app";
import { role } from "@/lib/db/schema";
import { requireAuth } from "@/middleware/guards";
import { roleResponseSchema, createRoleSchema, updateRoleSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentRole } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth());

const routes = defineCrudRoutes("Roles", "roleId", roleResponseSchema, createRoleSchema, updateRoleSchema);

registerCrudHandlers<CurrentRole>(app, routes, {
  table: role, tableName: "role", viewName: "current_role", historyView: "history_role",
  entityType: "role", entityLabel: "ロール", idParam: "roleId",
  mapRow: createMapper<CurrentRole>(),
  scope: () => null,
  buildCreate: (body) => ({ code: body.code, name: body.name }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    code: c.get("userRole") === "platform" ? (body.code ?? cur.code) : cur.code,
    name: body.name ?? cur.name,
    is_active: c.get("userRole") === "platform" ? (body.is_active ?? cur.is_active) : cur.is_active,
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
});

export default app;
