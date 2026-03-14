import { createApp } from "@/lib/create-app";
import { account } from "@/lib/db/schema";
import { requireAuth, requireBook } from "@/middleware/guards";
import { accountResponseSchema, createAccountSchema, updateAccountSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentAccount } from "@/lib/types";

const app = createApp();
app.use("*", requireAuth(), requireBook());

const routes = defineCrudRoutes("Accounts", "accountId", accountResponseSchema, createAccountSchema, updateAccountSchema);

registerCrudHandlers<CurrentAccount>(app, routes, {
  table: account, tableName: "account", viewName: "current_account", historyView: "history_account",
  entityType: "account", idParam: "accountId",
  mapRow: createMapper<CurrentAccount>([], ["book_key", "parent_account_key"]),
  scope: (c) => ({ book_key: c.get("bookKey") }),
  buildCreate: (body, c) => ({
    book_key: c.get("bookKey"), code: body.code, name: body.name,
    account_type: body.account_type,
    parent_account_key: body.parent_account_id ?? null,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name, account_type: body.account_type }),
  buildUpdate: (body, cur, c) => ({
    book_key: c.get("bookKey"), code: cur.code,
    name: body.name ?? cur.name, account_type: body.account_type ?? cur.account_type,
    parent_account_key: body.parent_account_id !== undefined ? body.parent_account_id : cur.parent_account_key,
    is_active: body.is_active ?? cur.is_active, created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: cur.code, name: body.name ?? cur.name, account_type: body.account_type ?? cur.account_type }),
  buildDeactivate: (cur, c) => ({
    book_key: c.get("bookKey"), code: cur.code,
    name: cur.name, account_type: cur.account_type,
    parent_account_key: cur.parent_account_key,
    created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name, account_type: cur.account_type }),
});

export default app;
