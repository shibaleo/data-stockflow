import { createApp } from "@/lib/create-app";
import { displayAccount } from "@/lib/db/schema";
import { requireAuth, requireBook } from "@/middleware/guards";
import { displayAccountResponseSchema, createDisplayAccountSchema, updateDisplayAccountSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentDisplayAccount } from "@/lib/types";
import type { UserRole } from "@/middleware/context";

function roleToAuthority(role: UserRole): string {
  if (role === "platform") return "tenant";
  if (role === "admin") return "admin";
  return "user";
}

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
    authority_level: roleToAuthority(c.get("userRole")),
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
    authority_level: cur.authority_level,
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
    authority_level: cur.authority_level,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({
    code: cur.code, name: cur.name, account_type: cur.account_type,
  }),
});

export default app;
