import { createApp } from "@/lib/create-app";
import { journalType } from "@/lib/db/schema";
import { requireTenant, requireAuth, requireBook } from "@/middleware/guards";
import { journalTypeResponseSchema, createJournalTypeSchema, updateJournalTypeSchema } from "@/lib/validators";
import { createMapper, defineCrudRoutes, registerCrudHandlers } from "@/lib/crud-factory";
import type { CurrentJournalType } from "@/lib/types";

const app = createApp();
app.use("*", requireTenant(), requireAuth(), requireBook());

const routes = defineCrudRoutes("JournalTypes", "journalTypeId", journalTypeResponseSchema, createJournalTypeSchema, updateJournalTypeSchema);

registerCrudHandlers<CurrentJournalType>(app, routes, {
  table: journalType, tableName: "journal_type", viewName: "current_journal_type", historyView: "history_journal_type",
  entityType: "journal_type", idParam: "journalTypeId",
  mapRow: createMapper<CurrentJournalType>(["book_key"]),
  scope: (c) => ({ book_key: c.get("bookKey") }),
  buildCreate: (body, c) => ({
    book_key: c.get("bookKey"), code: body.code, name: body.name,
    created_by: c.get("userKey"),
  }),
  hashCreate: (body) => ({ code: body.code, name: body.name }),
  buildUpdate: (body, cur, c) => ({
    book_key: c.get("bookKey"), code: body.code ?? cur.code,
    name: body.name ?? cur.name, is_active: body.is_active ?? cur.is_active,
    created_by: c.get("userKey"),
  }),
  hashUpdate: (body, cur) => ({ code: body.code ?? cur.code, name: body.name ?? cur.name }),
  buildDeactivate: (cur, c) => ({
    book_key: c.get("bookKey"), code: cur.code,
    name: cur.name, created_by: c.get("userKey"),
  }),
  hashDeactivate: (cur) => ({ code: cur.code, name: cur.name }),
});

export default app;
