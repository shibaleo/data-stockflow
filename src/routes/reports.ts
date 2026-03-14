import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { errorSchema } from "@/lib/validators";
import { requireTenant, requireAuth, requireBook } from "@/middleware/guards";

const app = createApp();
app.use("*", requireTenant(), requireAuth(), requireBook());

// ── Response schema ──

const balanceItemSchema = z.object({
  account_code: z.string(),
  display_code: z.string(),
  name: z.string(),
  account_type: z.string(),
  sign: z.number(),
  parent_account_code: z.string().nullable(),
  parent_display_code: z.string().nullable(),
  balance: z.string(), // Decimal as string
});

const balancesResponseSchema = z.object({
  data: z.array(balanceItemSchema),
  periods: z.array(z.string()),
});

// ── Query schema ──

const balancesQuerySchema = z.object({
  period_from: z.string().optional().openapi({ example: "2025-03" }),
  period_to: z.string().optional().openapi({ example: "2025-12" }),
});

// ── Route definition ──

const balances = createRoute({
  method: "get",
  path: "/balances",
  tags: ["Reports"],
  summary: "Get account balances",
  description:
    "Returns aggregated balances per account, optionally filtered by fiscal period range. " +
    "Amounts are signed (credit=positive, debit=negative). Multiply by account.sign to get display value.",
  request: { query: balancesQuerySchema },
  responses: {
    200: {
      description: "Success",
      content: { "application/json": { schema: balancesResponseSchema } },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

interface BalanceRow {
  account_code: string;
  display_code: string;
  name: string;
  account_type: string;
  sign: number;
  parent_account_code: string | null;
  parent_display_code: string | null;
  balance: string;
}

interface PeriodRow {
  display_code: string;
}

app.openapi(balances, async (c) => {
  const bookCode = c.get("bookCode");
  const tenantId = c.get("tenantId");
  const { period_from, period_to } = c.req.valid("query");

  // Build fiscal period code filters by resolving display_code → code
  const conditions = [sql`a.book_code = ${bookCode}`, sql`a.is_active = true`];

  // Filter journal lines by period range via journal_header
  let periodJoin = sql``;
  const periodConditions: ReturnType<typeof sql>[] = [];

  if (period_from) {
    periodConditions.push(sql`fp_filter.display_code >= ${period_from}`);
  }
  if (period_to) {
    periodConditions.push(sql`fp_filter.display_code <= ${period_to}`);
  }

  if (periodConditions.length > 0) {
    const periodFilter = sql.join(periodConditions, sql` AND `);
    periodJoin = sql`
      JOIN data_stockflow.current_fiscal_period fp_filter
        ON fp_filter.code = cj.fiscal_period_code AND fp_filter.book_code = ${bookCode}
        AND ${periodFilter}`;
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const query = sql`
    SELECT
      a.code AS account_code,
      a.display_code,
      a.name,
      a.account_type,
      a.sign,
      a.parent_account_code,
      pa.display_code AS parent_display_code,
      COALESCE(bal.balance, 0)::text AS balance
    FROM data_stockflow.current_account a
    LEFT JOIN data_stockflow.current_account pa
      ON pa.code = a.parent_account_code AND pa.book_code = a.book_code
    LEFT JOIN LATERAL (
      SELECT SUM(jl.amount) AS balance
      FROM data_stockflow.journal_line jl
      JOIN data_stockflow.current_journal cj
        ON cj.id = jl.journal_id AND cj.tenant_id = jl.tenant_id
        AND cj.is_active = true
      ${periodJoin}
      WHERE jl.tenant_id = ${tenantId}
        AND jl.account_code = a.code
    ) bal ON true
    WHERE ${whereClause}
    ORDER BY a.display_code
  `;

  const { rows } = await db.execute(query);
  const typedRows = rows as unknown as BalanceRow[];

  // Also fetch available periods for the frontend selector
  const { rows: periodRows } = await db.execute(
    sql`SELECT display_code FROM data_stockflow.current_fiscal_period
     WHERE book_code = ${bookCode} ORDER BY display_code`
  );
  const periods = periodRows as unknown as PeriodRow[];

  return c.json(
    {
      data: typedRows,
      periods: periods.map((p) => p.display_code),
    },
    200
  );
});

export default app;
