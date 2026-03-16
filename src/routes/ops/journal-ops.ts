/**
 * Journal Operations — reversal
 *
 * POST /journals/:journalId/reverse
 *   Creates a new journal with all debit/credit sides flipped
 *   under the same voucher as the original.
 */
import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { journal, journalLine, entityCategory } from "@/lib/db/schema";
import { getCurrent } from "@/lib/append-only";
import {
  errorSchema,
  dataSchema,
  journalDetailResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type {
  CurrentJournal,
  JournalLineRow,
  EntityCategoryRow,
} from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { recordEvent } from "@/lib/event-log";
import {
  computeRevisionHash,
  computeLinesHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";

const S = "data_stockflow";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

// ── Schema ──

const reverseSchema = z.object({
  description: z.string().optional(),
});

// ── Route ──

const reverse = createRoute({
  method: "post",
  path: "/{journalId}/reverse",
  tags: ["Journal Operations"],
  summary: "Reverse a journal entry (full-amount counter-entry)",
  description:
    "Creates a new journal with all debit/credit sides flipped under the same voucher.",
  request: {
    params: z.object({ journalId: z.string() }),
    body: { content: { "application/json": { schema: reverseSchema } } },
  },
  responses: {
    201: {
      description: "Reversal created",
      content: { "application/json": { schema: dataSchema(journalDetailResponseSchema) } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Validation error",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

// ── Handler ──

app.use(reverse.getRoutingPath(), requireRole("admin", "user"));
app.openapi(reverse, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const journalKey = Number(c.req.param("journalId"));
  const body = c.req.valid("json");

  // 1. Get current journal
  const current = await getCurrent<CurrentJournal>("current_journal", {
    key: journalKey,
  });
  if (!current) return c.json({ error: "Journal not found" }, 404);
  if (!current.is_active)
    return c.json({ error: "Cannot reverse an inactive journal" }, 422);

  // 2. Get original lines
  const { rows: linesRaw } = await db.execute(
    sql`SELECT * FROM ${sql.raw(`"${S}".journal_line`)}
    WHERE journal_key = ${journalKey} AND journal_revision = ${current.revision}
    ORDER BY sort_order, side`
  );
  const lines = linesRaw as JournalLineRow[];
  if (lines.length === 0)
    return c.json({ error: "Original journal has no lines" }, 422);

  // 3. Get original categories
  const { rows: catsRaw } = await db.execute(
    sql`SELECT * FROM ${sql.raw(`"${S}".entity_category`)}
    WHERE entity_key = ${journalKey} AND entity_revision = ${current.revision}`
  );
  const cats = catsRaw as EntityCategoryRow[];

  // 4. Build reversal
  const description =
    body.description ?? `Reversal of journal ${journalKey}`;

  const result = await db.transaction(async (tx: typeof db) => {
    // Reversed line inputs for hash
    const reversedLineInputs: LineHashInput[] = lines.map((l) => ({
      sort_order: l.sort_order,
      side: l.side === "debit" ? "credit" : "debit",
      account_key: l.account_key,
      department_key: l.department_key,
      counterparty_key: l.counterparty_key,
      amount: String(-parseFloat(String(l.amount))),
      description: l.description,
    }));
    const linesHash = computeLinesHash(reversedLineInputs);
    const revisionHash = computeRevisionHash({
      prev_revision_hash: GENESIS_PREV_HASH,
      journal_key: 0,
      revision: 1,
      adjustment_flag: current.adjustment_flag,
      description: description ?? null,
      lines_hash: linesHash,
    });

    // Insert journal (revision=1)
    const [j] = await tx.insert(journal).values({
      tenant_key: tenantKey,
      voucher_key: current.voucher_key,
      book_key: current.book_key,
      posted_at: current.posted_at,
      project_key: current.project_key,
      adjustment_flag: current.adjustment_flag,
      description,
      metadata: current.metadata ?? {},
      created_by: userKey,
      lines_hash: linesHash,
      prev_revision_hash: GENESIS_PREV_HASH,
      revision_hash: revisionHash,
    }).returning();

    // Insert reversed lines
    await tx.insert(journalLine).values(
      lines.map((l) => ({
        journal_key: j.key,
        journal_revision: 1,
        tenant_key: tenantKey,
        sort_order: l.sort_order,
        side: l.side === "debit" ? "credit" : "debit",
        account_key: l.account_key,
        department_key: l.department_key,
        counterparty_key: l.counterparty_key,
        amount: String(-parseFloat(String(l.amount))),
        description: l.description,
      })),
    );

    // Copy categories
    if (cats.length > 0) {
      await tx.insert(entityCategory).values(
        cats.map((ec) => ({
          tenant_key: tenantKey,
          category_type_code: ec.category_type_code,
          entity_key: j.key,
          entity_revision: 1,
          category_key: ec.category_key,
          created_by: userKey,
        })),
      );
    }

    return j;
  });

  recordAudit(c, {
    action: "reverse",
    entityType: "journal",
    entityKey: result.key,
    revision: 1,
    detail: { original_journal_key: journalKey },
  });
  recordEvent(c, {
    action: "reverse", entityType: "journal", entityKey: result.key,
    entityName: description,
    summary: `仕訳 #${journalKey} の逆仕訳を作成しました`,
  });

  // Build response
  const [linesResult, catsResult] = await Promise.all([
    db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}".journal_line`)}
      WHERE journal_key = ${result.key} AND journal_revision = 1
      ORDER BY sort_order, side
    `),
    db.execute(sql`
      SELECT * FROM ${sql.raw(`"${S}".entity_category`)}
      WHERE entity_key = ${result.key} AND entity_revision = 1
    `),
  ]);

  const responseLines = (linesResult.rows as JournalLineRow[]).map((l) => ({
    uuid: l.uuid,
    sort_order: l.sort_order,
    side: l.side,
    account_id: l.account_key,
    department_id: l.department_key,
    counterparty_id: l.counterparty_key,
    amount: String(Math.abs(parseFloat(String(l.amount)))),
    description: l.description,
  }));
  const responseCategories = (catsResult.rows as EntityCategoryRow[]).map((ec) => ({
    uuid: ec.uuid,
    category_type_code: ec.category_type_code,
    category_key: ec.category_key,
    created_at: ec.created_at instanceof Date ? ec.created_at.toISOString() : String(ec.created_at),
  }));

  return c.json({
    data: {
      id: result.key, voucher_id: result.voucher_key, book_id: result.book_key,
      posted_at: result.posted_at instanceof Date ? result.posted_at.toISOString() : String(result.posted_at),
      revision: 1,
      is_active: true, project_id: result.project_key,
      adjustment_flag: result.adjustment_flag,
      description: result.description,
      metadata: (result.metadata ?? {}) as Record<string, string>,
      created_at: result.created_at instanceof Date ? result.created_at.toISOString() : String(result.created_at),
      lines: responseLines, categories: responseCategories,
    },
  }, 201);
});

export default app;
