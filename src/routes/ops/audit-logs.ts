import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  errorSchema,
  paginatedSchema,
  systemLogResponseSchema,
  systemLogQuerySchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";

const S = "data_stockflow";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["System Logs"],
  summary: "Query system logs",
  description:
    "Returns system log entries filtered by entity, action, or user. " +
    "Available to admin and audit roles.",
  request: { query: systemLogQuerySchema },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: paginatedSchema(systemLogResponseSchema),
        },
      },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

app.use(list.getRoutingPath(), requireRole("admin", "audit"));
app.openapi(list, async (c) => {
  const tenantKey = c.get("tenantKey");
  const query = c.req.valid("query");
  const limit = Math.min(Number(query.limit || 50), 200);

  const conditions: ReturnType<typeof sql>[] = [sql`tenant_key = ${tenantKey}`];

  if (query.entity_type) {
    conditions.push(sql`entity_type = ${query.entity_type}`);
  }

  if (query.entity_id) {
    conditions.push(sql`entity_key = ${Number(query.entity_id)}`);
  }

  if (query.action) {
    conditions.push(sql`action = ${query.action}`);
  }

  if (query.cursor) {
    try {
      const plain = Buffer.from(query.cursor, "base64url").toString();
      const sep = plain.indexOf("|");
      if (sep > 0) {
        const cursorTime = plain.slice(0, sep);
        const cursorUuid = plain.slice(sep + 1);
        conditions.push(
          sql`(created_at, uuid) < (${cursorTime}::timestamptz, ${cursorUuid}::uuid)`,
        );
      }
    } catch { /* invalid cursor */ }
  }

  const whereClause = sql.join(conditions, sql` AND `);

  interface SystemLogRow {
    uuid: string;
    tenant_key: number | null;
    user_key: number;
    user_role: string;
    action: string;
    entity_type: string;
    entity_key: number;
    revision: number | null;
    detail: string | null;
    source_ip: string | null;
    created_at: Date;
  }

  const { rows: rawRows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".system_log`)}
    WHERE ${whereClause}
    ORDER BY created_at DESC, uuid DESC
    LIMIT ${limit}
  `);
  const rows = rawRows as unknown as SystemLogRow[];

  const data = rows.map((r) => ({
    uuid: r.uuid,
    tenant_id: r.tenant_key,
    user_id: r.user_key,
    user_role: r.user_role,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_key,
    revision: r.revision,
    detail: r.detail,
    source_ip: r.source_ip,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const nextCursor =
    rows.length === limit
      ? Buffer.from(
          `${rows[rows.length - 1].created_at instanceof Date ? rows[rows.length - 1].created_at.toISOString() : String(rows[rows.length - 1].created_at)}|${rows[rows.length - 1].uuid}`,
        ).toString("base64url")
      : null;

  return c.json({ data, next_cursor: nextCursor }, 200);
});

export default app;
