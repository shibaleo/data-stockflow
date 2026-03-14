import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import { decodeCursor, encodeCursor } from "@/lib/append-only";
import {
  errorSchema,
  paginatedSchema,
  auditLogResponseSchema,
  auditLogQuerySchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";

const S = "data_stockflow";

const app = new OpenAPIHono<{ Variables: AppVariables }>();

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

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (query.entity_type) {
    conditions.push(`entity_type = $${paramIdx}`);
    params.push(query.entity_type);
    paramIdx++;
  }

  if (query.entity_code) {
    conditions.push(`entity_code = $${paramIdx}`);
    params.push(query.entity_code);
    paramIdx++;
  }

  if (query.action) {
    conditions.push(`action = $${paramIdx}`);
    params.push(query.action);
    paramIdx++;
  }

  if (query.user_id) {
    conditions.push(`user_id = $${paramIdx}::uuid`);
    params.push(query.user_id);
    paramIdx++;
  }

  if (cursor) {
    conditions.push(
      `(created_at, id) < ($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid)`
    );
    params.push(cursor.created_at, cursor.id);
    paramIdx += 2;
  }

  params.push(limit);

  const sql = `
    SELECT * FROM "${S}"."audit_log"
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    LIMIT $${paramIdx}
  `;

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

  const rows = await prisma.$queryRawUnsafe<AuditLogRow[]>(sql, ...params);

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
