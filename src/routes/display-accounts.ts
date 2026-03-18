import { createApp } from "@/lib/create-app";
import { displayAccount } from "@/lib/db/schema";
import { requireAuth, requireBook } from "@/middleware/guards";
import { displayAccountResponseSchema, createDisplayAccountSchema, updateDisplayAccountSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import { checkReferences } from "@/lib/append-only";
import type { CurrentDisplayAccount } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth(), requireBook());

const routes = defineCrudRoutes(
  "DisplayAccounts", "displayAccountId",
  displayAccountResponseSchema, createDisplayAccountSchema, updateDisplayAccountSchema,
);

registerCrudHandlers<CurrentDisplayAccount>(app, routes, {
  table: displayAccount,
  tableName: "display_account",
  viewName: "current_display_account",
  historyView: "history_display_account",
  entityType: "display_account",
  entityLabel: "表示科目",
  idParam: "displayAccountId",
  mapRow: createMapper<CurrentDisplayAccount>([], ["book_key", "parent_key"]),
  scope: (c) => ({ book_key: c.get("bookKey") }),
  buildCreate: (body, c) => ({
    book_key: c.get("bookKey"),
    code: body.code,
    name: body.name,
    account_type: body.account_type,
    parent_key: body.parent_id ?? null,
    sort_order: body.sort_order ?? 0,
    authority_role_key: c.get("roleKey"),
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({
    code: body.code, name: body.name, account_type: body.account_type,
  }),
  buildUpdate: (body, cur, c) => ({
    book_key: c.get("bookKey"),
    code: body.code ?? cur.code,
    name: body.name ?? cur.name,
    account_type: body.account_type ?? cur.account_type,
    parent_key: body.parent_id !== undefined ? body.parent_id : cur.parent_key,
    sort_order: body.sort_order ?? cur.sort_order,
    authority_role_key: cur.authority_role_key,
    is_active: body.is_active ?? cur.is_active,
    created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({
    code: body.code ?? cur.code, name: body.name ?? cur.name,
    account_type: body.account_type ?? cur.account_type,
  }),
  buildDeactivate: (cur, c) => ({
    book_key: c.get("bookKey"),
    code: cur.code,
    name: cur.name,
    account_type: cur.account_type,
    parent_key: cur.parent_key,
    sort_order: cur.sort_order,
    authority_role_key: cur.authority_role_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({
    code: cur.code, name: cur.name, account_type: cur.account_type,
  }),
  canPurge: (key) => checkReferences("display_account_key", key, ["display_account"]),
  hasAuthority: true,
});

export default app;
