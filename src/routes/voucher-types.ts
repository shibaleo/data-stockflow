import { createApp } from "@/lib/create-app";
import { voucherType } from "@/lib/db/schema";
import { requireTenant, requireAuth } from "@/middleware/guards";
import { voucherTypeResponseSchema, createVoucherTypeSchema, updateVoucherTypeSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentVoucherType } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth());

const routes = defineCrudRoutes("VoucherTypes", "voucherTypeId", voucherTypeResponseSchema, createVoucherTypeSchema, updateVoucherTypeSchema);

registerCrudHandlers<CurrentVoucherType>(app, routes, {
  table: voucherType, tableName: "voucher_type", viewName: "current_voucher_type", historyView: "history_voucher_type",
  entityType: "voucher_type", entityLabel: "伝票タイプ", idParam: "voucherTypeId",
  mapRow: createMapper<CurrentVoucherType>(["tenant_key"], ["parent_voucher_type_key"]),
  scope: (c) => ({ tenant_key: c.get("tenantKey") }),
  buildCreate: (body, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code, name: body.name,
    parent_voucher_type_key: body.parent_voucher_type_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    tenant_key: c.get("tenantKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    parent_voucher_type_key: body.parent_voucher_type_id !== undefined ? body.parent_voucher_type_id : cur.parent_voucher_type_key,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur, c) => ({
    tenant_key: c.get("tenantKey"), code: cur.code,
    name: cur.name, parent_voucher_type_key: cur.parent_voucher_type_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
});

export default app;
