import { createApp } from "@/lib/create-app";
import { project } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { projectResponseSchema, createProjectSchema, updateProjectSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import { checkReferences } from "@/lib/append-only";
import type { CurrentProject } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Projects", "projectId", projectResponseSchema, createProjectSchema, updateProjectSchema);

registerCrudHandlers<CurrentProject>(app, routes, {
  table: project, tableName: "project", viewName: "current_project", historyView: "history_project",
  entityType: "project", entityLabel: "プロジェクト", idParam: "projectId",
  mapRow: createMapper<CurrentProject>(["tenant_key"], ["parent_project_key", "department_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    department_key: body.department_id ?? null,
    start_date: body.start_date ? new Date(body.start_date as string) : null,
    end_date: body.end_date ? new Date(body.end_date as string) : null,
    parent_project_key: body.parent_project_id ?? null,
    authority_role_key: c.get("roleKey"),
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    department_key: body.department_id !== undefined ? body.department_id : cur.department_key,
    start_date: body.start_date !== undefined ? (body.start_date ? new Date(body.start_date as string) : null) : cur.start_date,
    end_date: body.end_date !== undefined ? (body.end_date ? new Date(body.end_date as string) : null) : cur.end_date,
    parent_project_key: body.parent_project_id !== undefined ? body.parent_project_id : cur.parent_project_key,
    authority_role_key: cur.authority_role_key,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, department_key: cur.department_key,
    start_date: cur.start_date, end_date: cur.end_date,
    parent_project_key: cur.parent_project_key,
    authority_role_key: cur.authority_role_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
  canPurge: (key) => checkReferences("project_key", key, ["project"]),
  hasAuthority: true,
});

export default app;
