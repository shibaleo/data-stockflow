import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { voucher, journal, journalLine, journalTag } from "@/lib/db/schema";
import { errorSchema, dataSchema, voucherResponseSchema, voucherDetailResponseSchema, createVoucherSchema } from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { createMapper } from "@/lib/crud-factory";
import {
  acquireNextHeaderSequence,
  computeHeaderHash,
  computeRevisionHash,
  computeLinesHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";
import { getCurrent } from "@/lib/append-only";
import type { CurrentFiscalPeriod, CurrentJournal, JournalLineRow, JournalTagRow, VoucherRow } from "@/lib/types";

const S = "data_stockflow";
const app = createApp();
app.use("*", requireTenant(), requireAuth());

const mapVoucher = createMapper<VoucherRow>(
  ["tenant_key", "sequence_no", "prev_header_hash", "header_hash"],
  ["fiscal_period_key"],
);

// ── Route definitions ──

const list = createRoute({
  method: "get", path: "/", tags: ["Vouchers"], summary: "List vouchers",
  responses: { 200: { description: "Success", content: { "application/json": {
    schema: z.object({ data: z.array(voucherResponseSchema) }),
  } } } },
});

const get = createRoute({
  method: "get", path: "/{voucherId}", tags: ["Vouchers"], summary: "Get voucher with journals",
  request: { params: z.object({ voucherId: z.string() }) },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(voucherDetailResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post", path: "/", tags: ["Vouchers"], summary: "Create voucher with journals",
  request: { body: { content: { "application/json": { schema: createVoucherSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(voucherDetailResponseSchema) } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

// ── Handlers ──

app.openapi(list, async (c) => {
  const tenantKey = c.get("tenantKey");
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".voucher`)}
    WHERE tenant_key = ${tenantKey} AND revision = 1
    ORDER BY created_at DESC, key DESC
    LIMIT 50
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: (rows as VoucherRow[]).map(mapVoucher) } as any, 200);
});

app.openapi(get, async (c) => {
  const tenantKey = c.get("tenantKey");
  const voucherKey = Number(c.req.param("voucherId"));

  const { rows: vRows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".voucher`)}
    WHERE tenant_key = ${tenantKey} AND key = ${voucherKey} AND revision = 1
    LIMIT 1
  `);
  if (vRows.length === 0) return c.json({ error: "Not found" }, 404);
  const v = vRows[0] as VoucherRow;

  // Get current journals for this voucher
  const { rows: jRows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_journal`)}
    WHERE voucher_key = ${voucherKey}
    ORDER BY key
  `);
  const journals = jRows as CurrentJournal[];

  // Get lines and tags for each journal
  const journalsWithDetails = await Promise.all(journals.map(async (j) => {
    const [linesResult, tagsResult] = await Promise.all([
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".journal_line`)}
        WHERE journal_key = ${j.key} AND journal_revision = ${j.revision}
        ORDER BY sort_order, side
      `),
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".journal_tag`)}
        WHERE journal_key = ${j.key} AND journal_revision = ${j.revision}
      `),
    ]);
    const lines = (linesResult.rows as JournalLineRow[]).map((l) => ({
      uuid: l.uuid,
      sort_order: l.sort_order,
      side: l.side,
      account_id: l.account_key,
      department_id: l.department_key,
      counterparty_id: l.counterparty_key,
      amount: String(Math.abs(parseFloat(String(l.amount)))),
      description: l.description,
    }));
    const tags = (tagsResult.rows as JournalTagRow[]).map((t) => ({
      uuid: t.uuid,
      tag_id: t.tag_key,
      created_at: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
    }));
    return {
      id: j.key, voucher_id: j.voucher_key, book_id: j.book_key, revision: j.revision,
      is_active: j.is_active, journal_type_id: j.journal_type_key,
      voucher_type_id: j.voucher_type_key, adjustment_flag: j.adjustment_flag,
      description: j.description,
      created_at: j.created_at instanceof Date ? j.created_at.toISOString() : String(j.created_at),
      lines, tags,
    };
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: { ...mapVoucher(v), journals: journalsWithDetails } } as any, 200);
});

app.use(create.getRoutingPath(), requireRole("admin", "user"));
app.openapi(create, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const body = c.req.valid("json");

  // Resolve fiscal period
  let fiscalPeriodKey: number;
  if (body.fiscal_period_id) {
    const fp = await getCurrent<CurrentFiscalPeriod>("current_fiscal_period", {
      key: body.fiscal_period_id,
    });
    if (!fp) return c.json({ error: "fiscal_period not found" }, 422);
    if (fp.status !== "open") return c.json({ error: "Fiscal period is not open" }, 422);
    fiscalPeriodKey = fp.key;
  } else {
    // Auto-resolve from posted_date
    const { rows: fpRows } = await db.execute(sql`
      SELECT key, status FROM ${sql.raw(`"${S}".current_fiscal_period`)}
      WHERE start_date <= ${new Date(body.posted_date)}::timestamptz
        AND end_date >= ${new Date(body.posted_date)}::timestamptz
      ORDER BY start_date DESC
      LIMIT 1
    `);
    if (fpRows.length === 0) return c.json({ error: "No fiscal period found for posted_date" }, 422);
    const fp = fpRows[0] as { key: number; status: string };
    if (fp.status !== "open") return c.json({ error: "Fiscal period is not open" }, 422);
    fiscalPeriodKey = fp.key;
  }

  // Validate balance for each journal
  for (const jInput of body.journals) {
    const debit = jInput.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
    const credit = jInput.lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
    if (debit !== credit) {
      return c.json({ error: `Lines do not balance: debit(${debit}) != credit(${credit})` }, 422);
    }
  }

  const result = await db.transaction(async (tx: typeof db) => {
    // Header chain
    const { nextSequenceNo, prevHeaderHash } = await acquireNextHeaderSequence(tx, tenantKey);
    const headerCreatedAt = new Date().toISOString();
    const headerHash = computeHeaderHash({
      prev_header_hash: prevHeaderHash, tenant_key: tenantKey,
      sequence_no: nextSequenceNo, idempotency_key: body.idempotency_key,
      created_at: headerCreatedAt,
    });

    // Compute voucher hash for lines_hash / revision_hash
    const voucherLinesHash = computeLinesHash([]);
    const voucherRevisionHash = computeRevisionHash({
      prev_revision_hash: GENESIS_PREV_HASH, journal_key: 0,
      revision: 1, journal_type_key: 0, voucher_type_key: 0,
      adjustment_flag: "none", description: body.description ?? null,
      lines_hash: voucherLinesHash,
    });

    // Insert voucher
    const [v] = await tx.insert(voucher).values({
      tenant_key: tenantKey, idempotency_key: body.idempotency_key,
      fiscal_period_key: fiscalPeriodKey,
      voucher_code: body.voucher_code ?? null,
      posted_date: new Date(body.posted_date),
      description: body.description ?? null, source_system: body.source_system ?? null,
      created_by: userKey, sequence_no: nextSequenceNo,
      prev_header_hash: prevHeaderHash, header_hash: headerHash,
      lines_hash: voucherLinesHash, prev_revision_hash: GENESIS_PREV_HASH,
      revision_hash: voucherRevisionHash,
    }).returning();

    // Insert journals
    const createdJournals = [];
    for (const jInput of body.journals) {
      const signedLines = jInput.lines.map((l) => ({
        ...l,
        amount: String(l.side === "debit" ? -l.amount : l.amount),
      }));

      const linesHashInputs: LineHashInput[] = signedLines.map((l) => ({
        sort_order: l.sort_order, side: l.side, account_key: l.account_id,
        department_key: l.department_id, counterparty_key: l.counterparty_id,
        amount: l.amount, description: l.description,
      }));
      const linesHash = computeLinesHash(linesHashInputs);
      const revisionHash = computeRevisionHash({
        prev_revision_hash: GENESIS_PREV_HASH, journal_key: 0, revision: 1,
        journal_type_key: jInput.journal_type_id,
        voucher_type_key: jInput.voucher_type_id,
        adjustment_flag: jInput.adjustment_flag ?? "none",
        description: jInput.description ?? null, lines_hash: linesHash,
      });

      const [j] = await tx.insert(journal).values({
        tenant_key: tenantKey, voucher_key: v.key, book_key: jInput.book_id,
        journal_type_key: jInput.journal_type_id,
        voucher_type_key: jInput.voucher_type_id,
        adjustment_flag: jInput.adjustment_flag ?? "none",
        description: jInput.description ?? null,
        created_by: userKey, lines_hash: linesHash,
        prev_revision_hash: GENESIS_PREV_HASH, revision_hash: revisionHash,
      }).returning();

      // Insert lines
      await tx.insert(journalLine).values(
        signedLines.map((l) => ({
          journal_key: j.key, journal_revision: 1, tenant_key: tenantKey,
          sort_order: l.sort_order, side: l.side,
          account_key: l.account_id,
          department_key: l.department_id ?? null,
          counterparty_key: l.counterparty_id ?? null,
          amount: l.amount, description: l.description ?? null,
        })),
      );

      // Insert tags
      if (jInput.tags?.length) {
        await tx.insert(journalTag).values(
          jInput.tags.map((tagKey) => ({
            journal_key: j.key, journal_revision: 1,
            tenant_key: tenantKey, tag_key: tagKey, created_by: userKey,
          })),
        );
      }

      createdJournals.push({ journal: j, lines: signedLines, tags: jInput.tags ?? [] });
    }

    return { voucher: v, journals: createdJournals };
  });

  recordAudit(c, { action: "create", entityType: "voucher", entityKey: result.voucher.key });

  // Build response
  const voucherResponse = mapVoucher(result.voucher as unknown as VoucherRow);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const journalsResponse = result.journals.map((j: any) => ({
    id: j.journal.key, voucher_id: result.voucher.key, book_id: j.journal.book_key, revision: 1,
    is_active: true,
    journal_type_id: j.journal.journal_type_key, voucher_type_id: j.journal.voucher_type_key,
    adjustment_flag: j.journal.adjustment_flag, description: j.journal.description,
    created_at: j.journal.created_at instanceof Date ? j.journal.created_at.toISOString() : String(j.journal.created_at),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: j.lines.map((l: any) => ({
      uuid: "", sort_order: l.sort_order, side: l.side,
      account_id: l.account_id, department_id: l.department_id ?? null,
      counterparty_id: l.counterparty_id ?? null,
      amount: String(Math.abs(parseFloat(l.amount))),
      description: l.description ?? null,
    })),
    tags: [],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: { ...voucherResponse, journals: journalsResponse } } as any, 201);
});

export default app;
