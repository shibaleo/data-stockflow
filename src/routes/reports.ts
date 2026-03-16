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
});

// ── Query schema ──

const balancesQuerySchema = z.object({
  date_from: z.string().optional().openapi({ example: "2025-04-01T00:00:00Z" }),
  date_to: z.string().optional().openapi({ example: "2026-03-31T23:59:59Z" }),
});

// ── Route definition ──

const balances = createRoute({
  method: "get",
  path: "/balances",
  tags: ["Reports"],
  summary: "Get account balances",
  description:
    "Returns aggregated balances per account, optionally filtered by date range (posted_at). " +
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

app.openapi(balances, async (c) => {
  const bookKey = c.get("bookKey");
  const { date_from, date_to } = c.req.valid("query");

  const conditions = [sql`a.book_key = ${bookKey}`, sql`a.is_active = true`];

  // Filter journal lines by posted_at date range
  const dateConditions: ReturnType<typeof sql>[] = [];
  if (date_from) {
    dateConditions.push(sql`cj.posted_at >= ${date_from}::timestamptz`);
  }
  if (date_to) {
    dateConditions.push(sql`cj.posted_at <= ${date_to}::timestamptz`);
  }
  const dateFilter = dateConditions.length > 0
    ? sql` AND ${sql.join(dateConditions, sql` AND `)}`
    : sql``;

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
      WHERE jl.account_key = a.key${dateFilter}
    ) bal ON true
    WHERE ${whereClause}
    ORDER BY a.code
  `;

  const { rows } = await db.execute(query);
  const typedRows = rows as unknown as BalanceRow[];

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
    },
    200
  );
});

export default app;
