import { createApp } from "@/lib/create-app";
import { tag } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { tagResponseSchema, createTagSchema, updateTagSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentTag } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("Tags", "tagId", tagResponseSchema, createTagSchema, updateTagSchema);

registerCrudHandlers<CurrentTag>(app, routes, {
  table: tag, tableName: "tag", viewName: "current_tag", historyView: "history_tag",
  entityType: "tag", idParam: "tagId",
  mapRow: createMapper<CurrentTag>(["tenant_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    tag_type: body.tag_type, created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name, tag_type: body.tag_type }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: body.name ?? cur.name, tag_type: body.tag_type ?? cur.tag_type,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: cur.code, name: body.name ?? cur.name, tag_type: body.tag_type ?? cur.tag_type }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, tag_type: cur.tag_type, created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name, tag_type: cur.tag_type }),
});

export default app;
