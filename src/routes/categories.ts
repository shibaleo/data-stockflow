import { createApp } from "@/lib/create-app";
import { category } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { categoryResponseSchema, createCategorySchema, updateCategorySchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import { checkReferences } from "@/lib/append-only";
import type { CurrentCategory } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Categories", "categoryId", categoryResponseSchema, createCategorySchema, updateCategorySchema);

registerCrudHandlers<CurrentCategory>(app, routes, {
  table: category, tableName: "category", viewName: "current_category", historyView: "history_category",
  entityType: "category", entityLabel: "分類", idParam: "categoryId",
  mapRow: createMapper<CurrentCategory>(["tenant_key"], ["parent_category_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"),
    category_type_code: body.category_type_code,
    code: body.code, name: body.name,
    parent_category_key: body.parent_category_id ?? null,
    authority_role_key: c.get("roleKey"),
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ category_type_code: body.category_type_code, code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"),
    category_type_code: cur.category_type_code,
    code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    parent_category_key: body.parent_category_id !== undefined ? body.parent_category_id : cur.parent_category_key,
    authority_role_key: cur.authority_role_key,
    is_active: body.is_active ?? cur.is_active,
    created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({
    category_type_code: cur.category_type_code,
    code: body.code ?? cur.code,
    name: body.name ?? cur.name,
  }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"),
    category_type_code: cur.category_type_code,
    code: cur.code, name: cur.name,
    parent_category_key: cur.parent_category_key,
    authority_role_key: cur.authority_role_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({
    category_type_code: cur.category_type_code,
    code: cur.code, name: cur.name,
  }),
  canPurge: (key) => checkReferences("category_key", key, ["category"]),
  hasAuthority: true,
});

export default app;
