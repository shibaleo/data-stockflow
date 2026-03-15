import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { errorSchema } from "@/lib/validators";
import { requireAuth, requireBook } from "@/middleware/guards";

const S = "data_stockflow";

const app = createApp();
app.use("*", requireAuth(), requireBook());

// ── Response schema ──

const balanceItemSchema = z.object({
  account_id: z.number(),
  code: z.string(),
  name: z.string(),
  account_type: z.string(),
  sign: z.number(),
  parent_account_id: z.number().nullable(),
  balance: z.string(),
});

const balancesResponseSchema = z.object({
  data: z.array(balanceItemSchema),
  periods: z.array(z.object({ id: z.number(), code: z.string() })),
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
    "Returns aggregated balances per account, optionally filtered by period range. " +
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
  account_key: number;
  code: string;
  name: string;
  account_type: string;
  sign: number;
  parent_account_key: number | null;
  balance: string;
}

interface PeriodRow {
  key: number;
  code: string;
}

app.openapi(balances, async (c) => {
  const bookKey = c.get("bookKey");
  const { period_from, period_to } = c.req.valid("query");

  const conditions = [sql`a.book_key = ${bookKey}`, sql`a.is_active = true`];

  // Filter journal lines by period range via voucher → period
  const tenantKey = c.get("tenantKey");
  let periodJoin = sql``;
  const periodConditions: ReturnType<typeof sql>[] = [];

  if (period_from) {
    periodConditions.push(sql`fp.code >= ${period_from}`);
  }
  if (period_to) {
    periodConditions.push(sql`fp.code <= ${period_to}`);
  }

  if (periodConditions.length > 0) {
    const periodFilter = sql.join(periodConditions, sql` AND `);
    periodJoin = sql`
      JOIN ${sql.raw(`"${S}".voucher`)} v
        ON v.key = cj.voucher_key AND v.revision = 1
      JOIN ${sql.raw(`"${S}".current_period`)} fp
        ON fp.key = v.period_key AND fp.tenant_key = ${tenantKey}
        AND ${periodFilter}`;
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const query = sql`
    SELECT
      a.key AS account_key,
      a.code,
      a.name,
      a.account_type,
      a.sign,
      a.parent_account_key,
      COALESCE(bal.balance, 0)::text AS balance
    FROM ${sql.raw(`"${S}".current_account`)} a
    LEFT JOIN LATERAL (
      SELECT SUM(jl.amount) AS balance
      FROM ${sql.raw(`"${S}".journal_line`)} jl
      JOIN ${sql.raw(`"${S}".current_journal`)} cj
        ON cj.key = jl.journal_key AND cj.revision = jl.journal_revision
      ${periodJoin}
      WHERE jl.account_key = a.key
    ) bal ON true
    WHERE ${whereClause}
    ORDER BY a.code
  `;

  const { rows } = await db.execute(query);
  const typedRows = rows as unknown as BalanceRow[];

  // Fetch available periods for the frontend selector
  const { rows: periodRows } = await db.execute(
    sql`SELECT key, code FROM ${sql.raw(`"${S}".current_period`)}
     WHERE tenant_key = ${tenantKey} ORDER BY code`
  );
  const periods = periodRows as unknown as PeriodRow[];

  return c.json(
    {
      data: typedRows.map((r) => ({
        account_id: r.account_key,
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        sign: r.sign,
        parent_account_id: r.parent_account_key,
        balance: r.balance,
      })),
      periods: periods.map((p) => ({ id: p.key, code: p.code })),
    },
    200
  );
});

export default app;
