import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "@/lib/append-only";
import {
  errorSchema,
  paginatedSchema,
  auditLogResponseSchema,
  auditLogQuerySchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

// ────────────────────────────────────────────
// GET /audit-logs
// ────────────────────────────────────────────

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Audit Logs"],
  summary: "Query audit logs",
  description:
    "Returns audit log entries filtered by entity, action, or user. " +
    "Available to tenant, admin, and audit roles.",
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

app.use(list.getRoutingPath(), requireRole("tenant", "admin", "audit"));
app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");
  const query = c.req.valid("query");
  const limit = Math.min(Number(query.limit || 50), 200);
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const conditions: ReturnType<typeof sql>[] = [sql`tenant_id = ${tenantId}`];

  if (query.entity_type) {
    conditions.push(sql`entity_type = ${query.entity_type}`);
  }

  if (query.entity_code) {
    conditions.push(sql`entity_code = ${query.entity_code}`);
  }

  if (query.action) {
    conditions.push(sql`action = ${query.action}`);
  }

  if (query.user_id) {
    conditions.push(sql`user_id = ${query.user_id}::uuid`);
  }

  if (cursor) {
    conditions.push(
      sql`(created_at, id) < (${cursor.created_at}::timestamptz, ${cursor.id}::uuid)`
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  interface AuditLogRow {
    id: string;
    tenant_id: string | null;
    user_id: string;
    user_role: string;
    action: string;
    entity_type: string;
    entity_code: string;
    revision: number | null;
    detail: string | null;
    source_ip: string | null;
    created_at: Date;
  }

  const { rows: rawRows } = await db.execute(sql`
    SELECT * FROM "data_stockflow"."audit_log"
    WHERE ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `);
  const rows = rawRows as unknown as AuditLogRow[];

  return c.json(
    {
      data: rows,
      next_cursor:
        rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
    },
    200
  );
});

export default app;
