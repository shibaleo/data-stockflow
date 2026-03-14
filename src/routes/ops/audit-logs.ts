import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  errorSchema,
  paginatedSchema,
  auditLogResponseSchema,
  auditLogQuerySchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";

const S = "data_stockflow";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Audit Logs"],
  summary: "Query audit logs",
  description:
    "Returns audit log entries filtered by entity, action, or user. " +
    "Available to admin and audit roles.",
  request: { query: auditLogQuerySchema },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: paginatedSchema(auditLogResponseSchema),
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
      const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
      if (decoded.created_at && decoded.uuid) {
        conditions.push(
          sql`(created_at, uuid) < (${decoded.created_at}::timestamptz, ${decoded.uuid}::uuid)`
        );
      }
    } catch {
      // invalid cursor
    }
  }

  const whereClause = sql.join(conditions, sql` AND `);

  interface AuditRow {
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
    SELECT * FROM ${sql.raw(`"${S}".audit_log`)}
    WHERE ${whereClause}
    ORDER BY created_at DESC, uuid DESC
    LIMIT ${limit}
  `);
  const rows = rawRows as unknown as AuditRow[];

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
          JSON.stringify({
            created_at:
              rows[rows.length - 1].created_at instanceof Date
                ? rows[rows.length - 1].created_at.toISOString()
                : String(rows[rows.length - 1].created_at),
            uuid: rows[rows.length - 1].uuid,
          })
        ).toString("base64url")
      : null;

  return c.json({ data, next_cursor: nextCursor }, 200);
});

export default app;
