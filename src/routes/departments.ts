import { createApp } from "@/lib/create-app";
import { department } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { departmentResponseSchema, createDepartmentSchema, updateDepartmentSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentDepartment } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Departments", "departmentId", departmentResponseSchema, createDepartmentSchema, updateDepartmentSchema);

registerCrudHandlers<CurrentDepartment>(app, routes, {
  table: department, tableName: "department", viewName: "current_department", historyView: "history_department",
  entityType: "department", idParam: "departmentId",
  mapRow: createMapper<CurrentDepartment>(["tenant_key"], ["parent_department_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    department_type: body.department_type ?? null,
    parent_department_key: body.parent_department_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    department_type: body.department_type !== undefined ? body.department_type : cur.department_type,
    parent_department_key: body.parent_department_id !== undefined ? body.parent_department_id : cur.parent_department_key,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, department_type: cur.department_type,
    parent_department_key: cur.parent_department_key, created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
});

export default app;
