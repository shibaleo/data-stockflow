/**
 * Journal routes — nested under /vouchers/:voucherId/journals
 *
 * GET    /                    List journals for voucher
 * GET    /:journalId          Get journal with lines + tags
 * PUT    /:journalId          Update journal (new revision)
 * DELETE /:journalId          Deactivate journal
 * GET    /:journalId/history  Journal revision history
 */
import { createApp } from "@/lib/create-app";
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { journal, journalLine, journalTag } from "@/lib/db/schema";
import {
  errorSchema, messageSchema, dataSchema,
  journalResponseSchema, journalDetailResponseSchema,
  updateJournalSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import { recordAudit } from "@/lib/audit";
import { getMaxRevision } from "@/lib/append-only";
import {
  computeRevisionHash,
  computeLinesHash,
  getPrevRevisionHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";
import type { CurrentJournal, JournalLineRow, JournalTagRow } from "@/lib/types";

const S = "data_stockflow";
const app = createApp();
app.use("*", requireTenant(), requireAuth());

// ── Helpers ──

async function getJournalForVoucher(
  voucherKey: number,
  journalKey: number,
): Promise<CurrentJournal | null> {
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_journal`)}
    WHERE voucher_key = ${voucherKey} AND key = ${journalKey}
    LIMIT 1
  `);
  return (rows[0] as CurrentJournal) ?? null;
}

async function buildJournalDetail(j: CurrentJournal) {
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
}

// ── Route definitions ──

const params = z.object({
  voucherId: z.string(),
  journalId: z.string(),
});

const listRoute = createRoute({
  method: "get", path: "/", tags: ["Journals"], summary: "List journals for voucher",
  request: { params: z.object({ voucherId: z.string() }) },
  responses: {
    200: { description: "Success", content: { "application/json": {
      schema: z.object({ data: z.array(journalDetailResponseSchema) }),
    } } },
  },
});

const getRoute = createRoute({
  method: "get", path: "/{journalId}", tags: ["Journals"], summary: "Get journal detail",
  request: { params },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(journalDetailResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const updateRoute = createRoute({
  method: "put", path: "/{journalId}", tags: ["Journals"], summary: "Update journal (new revision)",
  request: { params, body: { content: { "application/json": { schema: updateJournalSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(journalDetailResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteRoute = createRoute({
  method: "delete", path: "/{journalId}", tags: ["Journals"], summary: "Deactivate journal",
  request: { params },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Already deactivated", content: { "application/json": { schema: errorSchema } } },
  },
});

const historyRoute = createRoute({
  method: "get", path: "/{journalId}/history", tags: ["Journals"], summary: "Journal revision history",
  request: { params },
  responses: {
    200: { description: "Success", content: { "application/json": {
      schema: z.object({ data: z.array(journalResponseSchema) }),
    } } },
  },
});

// ── Handlers ──

app.openapi(listRoute, async (c) => {
  const voucherKey = Number(c.req.param("voucherId"));
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".current_journal`)}
    WHERE voucher_key = ${voucherKey}
    ORDER BY key
  `);
  const journals = rows as CurrentJournal[];
  const data = await Promise.all(journals.map(buildJournalDetail));
  return c.json({ data }, 200);
});

app.openapi(getRoute, async (c) => {
  const voucherKey = Number(c.req.param("voucherId"));
  const journalKey = Number(c.req.param("journalId"));
  const j = await getJournalForVoucher(voucherKey, journalKey);
  if (!j) return c.json({ error: "Not found" }, 404);
  return c.json({ data: await buildJournalDetail(j) }, 200);
});

app.use(updateRoute.getRoutingPath(), requireRole("admin", "user"));
app.openapi(updateRoute, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const voucherKey = Number(c.req.param("voucherId"));
  const journalKey = Number(c.req.param("journalId"));
  const body = c.req.valid("json");

  const current = await getJournalForVoucher(voucherKey, journalKey);
  if (!current) return c.json({ error: "Not found" }, 404);

  // Balance check
  const debit = body.lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
  const credit = body.lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
  if (debit !== credit) {
    return c.json({ error: `Lines do not balance: debit(${debit}) != credit(${credit})` }, 422);
  }

  const signedLines = body.lines.map((l) => ({
    ...l,
    amount: String(l.side === "debit" ? -l.amount : l.amount),
  }));

  const maxRev = await getMaxRevision("journal", journalKey);

  const result = await db.transaction(async (tx: typeof db) => {
    const prevRevisionHash = await getPrevRevisionHash(tx, journalKey, maxRev + 1);

    const resolvedTypeKey = body.journal_type_id ?? current.journal_type_key;
    const resolvedVoucherTypeKey = body.voucher_type_id ?? current.voucher_type_key;
    const resolvedAdj = body.adjustment_flag ?? current.adjustment_flag;
    const resolvedDesc = body.description !== undefined ? body.description : current.description;
    const resolvedActive = body.is_active ?? current.is_active;

    const linesHashInputs: LineHashInput[] = signedLines.map((l) => ({
      sort_order: l.sort_order, side: l.side, account_key: l.account_id,
      department_key: l.department_id, counterparty_key: l.counterparty_id,
      amount: l.amount, description: l.description,
    }));
    const linesHash = computeLinesHash(linesHashInputs);
    const revisionHash = computeRevisionHash({
      prev_revision_hash: prevRevisionHash, journal_key: journalKey,
      revision: maxRev + 1, journal_type_key: resolvedTypeKey,
      voucher_type_key: resolvedVoucherTypeKey, adjustment_flag: resolvedAdj,
      description: resolvedDesc ?? null, lines_hash: linesHash,
    });

    const resolvedBookKey = body.book_id ?? current.book_key;

    const [j] = await tx.insert(journal).values({
      key: journalKey, revision: maxRev + 1,
      tenant_key: tenantKey, voucher_key: voucherKey, book_key: resolvedBookKey,
      is_active: resolvedActive, journal_type_key: resolvedTypeKey,
      voucher_type_key: resolvedVoucherTypeKey, adjustment_flag: resolvedAdj,
      description: resolvedDesc, created_by: userKey,
      lines_hash: linesHash, prev_revision_hash: prevRevisionHash,
      revision_hash: revisionHash,
    }).returning();

    await tx.insert(journalLine).values(
      signedLines.map((l) => ({
        journal_key: journalKey, journal_revision: maxRev + 1, tenant_key: tenantKey,
        sort_order: l.sort_order, side: l.side,
        account_key: l.account_id,
        department_key: l.department_id ?? null,
        counterparty_key: l.counterparty_id ?? null,
        amount: l.amount, description: l.description ?? null,
      })),
    );

    if (body.tags?.length) {
      await tx.insert(journalTag).values(
        body.tags.map((tagKey) => ({
          journal_key: journalKey, journal_revision: maxRev + 1,
          tenant_key: tenantKey, tag_key: tagKey, created_by: userKey,
        })),
      );
    }

    return j;
  });

  const action = body.is_active === false ? "deactivate" as const : "update" as const;
  recordAudit(c, { action, entityType: "journal", entityKey: journalKey, revision: maxRev + 1 });

  // Re-fetch for full response
  const updated = await getJournalForVoucher(voucherKey, journalKey);
  return c.json({ data: await buildJournalDetail(updated!) }, 200);
});

app.use(deleteRoute.getRoutingPath(), requireRole("admin", "user"));
app.openapi(deleteRoute, async (c) => {
  const tenantKey = c.get("tenantKey");
  const userKey = c.get("userKey");
  const voucherKey = Number(c.req.param("voucherId"));
  const journalKey = Number(c.req.param("journalId"));

  const current = await getJournalForVoucher(voucherKey, journalKey);
  if (!current) return c.json({ error: "Not found" }, 404);
  if (!current.is_active) return c.json({ error: "Already deactivated" }, 422);

  const maxRev = await getMaxRevision("journal", journalKey);

  await db.transaction(async (tx: typeof db) => {
    const prevRevisionHash = await getPrevRevisionHash(tx, journalKey, maxRev + 1);
    const linesHash = computeLinesHash([]);
    const revisionHash = computeRevisionHash({
      prev_revision_hash: prevRevisionHash, journal_key: journalKey,
      revision: maxRev + 1, journal_type_key: current.journal_type_key,
      voucher_type_key: current.voucher_type_key, adjustment_flag: current.adjustment_flag,
      description: current.description ?? null, lines_hash: linesHash,
    });

    await tx.insert(journal).values({
      key: journalKey, revision: maxRev + 1,
      tenant_key: tenantKey, voucher_key: voucherKey, book_key: current.book_key,
      is_active: false, journal_type_key: current.journal_type_key,
      voucher_type_key: current.voucher_type_key, adjustment_flag: current.adjustment_flag,
      description: current.description, created_by: userKey,
      lines_hash: linesHash, prev_revision_hash: prevRevisionHash,
      revision_hash: revisionHash,
    });
  });

  recordAudit(c, { action: "deactivate", entityType: "journal", entityKey: journalKey, revision: maxRev + 1 });
  return c.json({ message: "Deactivated" }, 200);
});

app.openapi(historyRoute, async (c) => {
  const journalKey = Number(c.req.param("journalId"));
  const { rows } = await db.execute(sql`
    SELECT * FROM ${sql.raw(`"${S}".journal`)}
    WHERE key = ${journalKey}
    ORDER BY revision ASC
  `);
  const journals = rows as CurrentJournal[];
  return c.json({
    data: journals.map((j) => ({
      id: j.key, voucher_id: j.voucher_key, book_id: j.book_key, revision: j.revision,
      is_active: j.is_active, journal_type_id: j.journal_type_key,
      voucher_type_id: j.voucher_type_key, adjustment_flag: j.adjustment_flag,
      description: j.description,
      created_at: j.created_at instanceof Date ? j.created_at.toISOString() : String(j.created_at),
    })),
  }, 200);
});

export default app;
