import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { voucher, journal, journalLine, entityCategory } from "@/lib/db/schema";
import { errorSchema, dataSchema, paginatedSchema, listQuerySchema, voucherResponseSchema, voucherDetailResponseSchema, createVoucherSchema, updateVoucherSchema } from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { recordEvent } from "@/lib/event-log";
import { createMapper } from "@/lib/crud-factory";
import { authorityCheck } from "@/lib/authority";
import {
  acquireNextHeaderSequence,
  computeHeaderHash,
  computeRevisionHash,
  computeVoucherContentHash,
  computeLinesHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";
import { bumpVoucherRevision } from "@/lib/voucher-cascade";
import { decodeCursor, encodeCursor } from "@/lib/append-only";
import type { CurrentJournal, JournalLineRow, EntityCategoryRow, VoucherRow } from "@/lib/types";

const S = "data_stockflow";
const app = createApp();
app.use("*", requireTenant(), requireAuth());

const mapVoucher = createMapper<VoucherRow>(
  ["tenant_key", "sequence_no", "prev_header_hash", "header_hash"],
  [],
);

// ── Route definitions ──

const list = createRoute({
  method: "get", path: "/", tags: ["Vouchers"], summary: "List vouchers",
  request: { query: listQuerySchema },
  responses: { 200: { description: "Success", content: { "application/json": {
    schema: paginatedSchema(voucherResponseSchema),
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

const update = createRoute({
  method: "put", path: "/{voucherId}", tags: ["Vouchers"], summary: "Update voucher (new revision)",
  request: {
    params: z.object({ voucherId: z.string() }),
    body: { content: { "application/json": { schema: updateVoucherSchema } } },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(voucherDetailResponseSchema) } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

// ── Handlers ──

app.openapi(list, async (c) => {
  const tenantKey = c.get("tenantKey");
  const query = c.req.valid("query");
  const limit = Math.min(Number(query.limit || 100), 200);
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const cursorClause = cursor ? sql`AND key < ${cursor}` : sql``;
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_voucher`)}
    WHERE tenant_key = ${tenantKey}
    ${cursorClause}
    ORDER BY key DESC
    LIMIT ${limit}
  `);
  const mapped = (rows as VoucherRow[]).map(mapVoucher);
  const nextCursor = rows.length === limit
    ? encodeCursor(rows[rows.length - 1] as VoucherRow)
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: mapped, next_cursor: nextCursor } as any, 200);
});

app.openapi(get, async (c) => {
  const tenantKey = c.get("tenantKey");
  const voucherKey = Number(c.req.param("voucherId"));

  const { rows: vRows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_voucher`)}
    WHERE tenant_key = ${tenantKey} AND key = ${voucherKey}
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

  // Get lines and categories for each journal
  const journalsWithDetails = await Promise.all(journals.map(async (j) => {
    const [linesResult, catsResult] = await Promise.all([
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".journal_line`)}
        WHERE journal_key = ${j.key} AND journal_revision = ${j.revision}
        ORDER BY sort_order, side
      `),
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".entity_category`)}
        WHERE entity_key = ${j.key} AND entity_revision = ${j.revision}
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
    const categories = (catsResult.rows as EntityCategoryRow[]).map((ec) => ({
      uuid: ec.uuid,
      category_type_code: ec.category_type_code,
      category_key: ec.category_key,
      created_at: ec.created_at instanceof Date ? ec.created_at.toISOString() : String(ec.created_at),
    }));
    return {
      id: j.key, voucher_id: j.voucher_key, book_id: j.book_key,
      posted_at: j.posted_at instanceof Date ? j.posted_at.toISOString() : String(j.posted_at),
      revision: j.revision,
      is_active: j.is_active, project_id: j.project_key,
      authority_role_key: j.authority_role_key,
      adjustment_flag: j.adjustment_flag,
      description: j.description,
      metadata: (j.metadata ?? {}) as Record<string, string>,
      created_at: j.created_at instanceof Date ? j.created_at.toISOString() : String(j.created_at),
      lines, categories,
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

    // Pre-compute journal hashes to derive voucher content hash
    const journalHashSpecs = body.journals.map((jInput) => {
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
        adjustment_flag: jInput.adjustment_flag ?? "none",
        description: jInput.description ?? null, lines_hash: linesHash,
      });
      return { signedLines, linesHash, revisionHash };
    });

    // Compute voucher hash from journal revision hashes
    const voucherLinesHash = computeVoucherContentHash(
      journalHashSpecs.map((s) => s.revisionHash),
    );
    const voucherRevisionHash = computeRevisionHash({
      prev_revision_hash: GENESIS_PREV_HASH, journal_key: 0,
      revision: 1, adjustment_flag: "none",
      description: body.description ?? null,
      lines_hash: voucherLinesHash,
    });

    // Insert voucher
    const [v] = await tx.insert(voucher).values({
      tenant_key: tenantKey, idempotency_key: body.idempotency_key,
      voucher_code: body.voucher_code ?? null,
      description: body.description ?? null, source_system: body.source_system ?? null,
      created_by: userKey, sequence_no: nextSequenceNo,
      prev_header_hash: prevHeaderHash, header_hash: headerHash,
      lines_hash: voucherLinesHash, prev_revision_hash: GENESIS_PREV_HASH,
      revision_hash: voucherRevisionHash,
      authority_role_key: c.get("roleKey"),
    }).returning();

    // Insert journals
    const createdJournals = [];
    for (let i = 0; i < body.journals.length; i++) {
      const jInput = body.journals[i];
      const { signedLines, linesHash, revisionHash } = journalHashSpecs[i];

      const [j] = await tx.insert(journal).values({
        tenant_key: tenantKey, voucher_key: v.key, book_key: jInput.book_id,
        posted_at: new Date(jInput.posted_at),
        project_key: jInput.project_id ?? null,
        adjustment_flag: jInput.adjustment_flag ?? "none",
        description: jInput.description ?? null,
        metadata: jInput.metadata ?? {},
        created_by: userKey, lines_hash: linesHash,
        prev_revision_hash: GENESIS_PREV_HASH, revision_hash: revisionHash,
        authority_role_key: c.get("roleKey"),
      }).returning();

      // Insert lines
      await tx.insert(journalLine).values(
        signedLines.map((l) => ({
          journal_key: j.key, journal_revision: 1, tenant_key: tenantKey,
          sort_order: l.sort_order, side: l.side,
          account_key: l.account_id,
          department_key: l.department_id,
          counterparty_key: l.counterparty_id,
          amount: l.amount, description: l.description ?? null,
        })),
      );

      // Insert journal_type category
      if (jInput.journal_type_id) {
        await tx.insert(entityCategory).values({
          tenant_key: tenantKey, category_type_code: "journal_type",
          entity_key: j.key, entity_revision: 1,
          category_key: jInput.journal_type_id, created_by: userKey,
        });
      }

      // Insert journal_tag categories
      if (jInput.tags?.length) {
        await tx.insert(entityCategory).values(
          jInput.tags.map((catKey) => ({
            tenant_key: tenantKey, category_type_code: "journal_tag" as const,
            entity_key: j.key, entity_revision: 1,
            category_key: catKey, created_by: userKey,
          })),
        );
      }

      createdJournals.push({ journal: j, lines: signedLines, tags: jInput.tags ?? [] });
    }

    return { voucher: v, journals: createdJournals };
  });

  recordAudit(c, { action: "create", entityType: "voucher", entityKey: result.voucher.key });
  recordEvent(c, {
    action: "create", entityType: "voucher", entityKey: result.voucher.key,
    entityName: body.voucher_code ?? undefined,
    summary: `伝票を作成しました（仕訳${body.journals.length}件）`,
  });

  // Build response
  const voucherResponse = mapVoucher(result.voucher as unknown as VoucherRow);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const journalsResponse = result.journals.map((j: any) => ({
    id: j.journal.key, voucher_id: result.voucher.key, book_id: j.journal.book_key,
    posted_at: j.journal.posted_at instanceof Date ? j.journal.posted_at.toISOString() : String(j.journal.posted_at),
    revision: 1,
    is_active: true,
    project_id: j.journal.project_key,
    authority_role_key: j.journal.authority_role_key,
    adjustment_flag: j.journal.adjustment_flag, description: j.journal.description,
    metadata: (j.journal.metadata ?? {}) as Record<string, string>,
    created_at: j.journal.created_at instanceof Date ? j.journal.created_at.toISOString() : String(j.journal.created_at),
    lines: j.lines.map((l: any) => ({
      uuid: "", sort_order: l.sort_order, side: l.side,
      account_id: l.account_id, department_id: l.department_id,
      counterparty_id: l.counterparty_id,
      amount: String(Math.abs(parseFloat(l.amount))),
      description: l.description ?? null,
    })),
    categories: [],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: { ...voucherResponse, journals: journalsResponse } } as any, 201);
});

// ── Update handler ──

app.use(update.getRoutingPath(), requireRole("admin", "user"));
app.openapi(update, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const voucherKey = Number(c.req.param("voucherId"));
  const body = c.req.valid("json");

  // Check existence + authority
  const { rows: checkRows } = await db.execute(sql`
    SELECT key, authority_role_key FROM ${sql.raw(`"${S}".current_voucher`)}
    WHERE tenant_key = ${tenantKey} AND key = ${voucherKey}
    LIMIT 1
  `);
  if (checkRows.length === 0) return c.json({ error: "Not found" }, 404);
  const vRow = checkRows[0] as { key: number; authority_role_key: number };
  const authErr = await authorityCheck(c.get("roleRank"), vRow.authority_role_key, "伝票");
  if (authErr) return c.json({ error: authErr }, 403);

  const result = await db.transaction(async (tx: typeof db) => {
    return bumpVoucherRevision(tx, voucherKey, tenantKey, userKey, {
      voucher_code: body.voucher_code,
      description: body.description,
      source_system: body.source_system,
    });
  });

  recordAudit(c, { action: "update", entityType: "voucher", entityKey: voucherKey, revision: result.revision });
  recordEvent(c, {
    action: "update", entityType: "voucher", entityKey: voucherKey,
    entityName: result.voucher_code ?? undefined,
    summary: `伝票 #${voucherKey} を更新しました`,
  });

  // Return updated voucher with journals
  const { rows: jRows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_journal`)}
    WHERE voucher_key = ${voucherKey}
    ORDER BY key
  `);
  const journals = jRows as CurrentJournal[];
  const journalsWithDetails = await Promise.all(journals.map(async (j) => {
    const [linesResult, catsResult] = await Promise.all([
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".journal_line`)}
        WHERE journal_key = ${j.key} AND journal_revision = ${j.revision}
        ORDER BY sort_order, side
      `),
      db.execute(sql`
        SELECT * FROM ${sql.raw(`"${S}".entity_category`)}
        WHERE entity_key = ${j.key} AND entity_revision = ${j.revision}
      `),
    ]);
    const lines = (linesResult.rows as JournalLineRow[]).map((l) => ({
      uuid: l.uuid, sort_order: l.sort_order, side: l.side,
      account_id: l.account_key, department_id: l.department_key,
      counterparty_id: l.counterparty_key,
      amount: String(Math.abs(parseFloat(String(l.amount)))),
      description: l.description,
    }));
    const categories = (catsResult.rows as EntityCategoryRow[]).map((ec) => ({
      uuid: ec.uuid, category_type_code: ec.category_type_code,
      category_key: ec.category_key,
      created_at: ec.created_at instanceof Date ? ec.created_at.toISOString() : String(ec.created_at),
    }));
    return {
      id: j.key, voucher_id: j.voucher_key, book_id: j.book_key,
      posted_at: j.posted_at instanceof Date ? j.posted_at.toISOString() : String(j.posted_at),
      revision: j.revision, is_active: j.is_active, project_id: j.project_key,
      authority_role_key: j.authority_role_key,
      adjustment_flag: j.adjustment_flag, description: j.description,
      metadata: (j.metadata ?? {}) as Record<string, string>,
      created_at: j.created_at instanceof Date ? j.created_at.toISOString() : String(j.created_at),
      lines, categories,
    };
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ data: { ...mapVoucher(result as unknown as VoucherRow), journals: journalsWithDetails } } as any, 200);
});

export default app;
