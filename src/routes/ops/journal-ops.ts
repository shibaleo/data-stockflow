import { createApp } from "@/lib/create-app";
import { createRoute } from "@hono/zod-openapi";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { journal, journalHeader, journalLine, journalTag } from "@/lib/db/schema";
import { getCurrent } from "@/lib/append-only";
import {
  codeParamSchema,
  errorSchema,
  dataSchema,
  reverseJournalSchema,
  reverseJournalResponseSchema,
} from "@/lib/validators";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type {
  CurrentJournal,
  CurrentFiscalPeriod,
  CurrentTenantSetting,
  JournalLineRow,
  JournalTagRow,
} from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import {
  acquireNextHeaderSequence,
  computeHeaderHash,
  computeRevisionHash,
  computeLinesHash,
  GENESIS_PREV_HASH,
  type LineHashInput,
} from "@/lib/hash-chain";

const S = "data_stockflow";

const app = createApp();

app.use("*", requireTenant(), requireAuth());

// ────────────────────────────────────────────
// POST /journals/{code}/reverse
// ────────────────────────────────────────────

const reverse = createRoute({
  method: "post",
  path: "/{code}/reverse",
  tags: ["Journal Operations"],
  summary: "Reverse a journal entry (full-amount counter-entry)",
  description:
    "Creates a new journal with all debit/credit sides flipped. " +
    "The reversal journal uses idempotency_code `reverse:{original_code}` to prevent duplicates.",
  request: {
    params: codeParamSchema,
    body: {
      content: {
        "application/json": { schema: reverseJournalSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Reversal created",
      content: {
        "application/json": {
          schema: dataSchema(reverseJournalResponseSchema),
        },
      },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Already reversed",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Validation error",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

app.use(reverse.getRoutingPath(), requireRole("admin", "user"));
app.openapi(reverse, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  // 1. Get current journal
  const current = await getCurrent<CurrentJournal>("current_journal", {
    tenant_id: tenantId,
    idempotency_code: code,
  });
  if (!current) return c.json({ error: "Journal not found" }, 404);
  if (!current.is_active)
    return c.json({ error: "Cannot reverse an inactive journal" }, 422);

  // 2. journal_type + role check (closing/prior_adj require admin)
  if (
    ["closing", "prior_adj"].includes(current.journal_type) &&
    c.get("userRole") === "user"
  ) {
    return c.json(
      { error: "Insufficient role to reverse this journal type" },
      403
    );
  }

  // 3. Determine posted_date
  const postedDate = body.posted_date
    ? new Date(body.posted_date)
    : new Date();

  // 4. Check locked_until
  const setting = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (setting?.locked_until && postedDate <= new Date(setting.locked_until)) {
    return c.json(
      { error: "posted_date is within locked period" },
      422
    );
  }

  // 5. Fiscal period must be open (in any book under this tenant)
  const { rows: fpRows } = await db.execute(
    sql`SELECT fp.* FROM "${sql.raw(S)}"."current_fiscal_period" fp
     JOIN "${sql.raw(S)}"."current_book" cb ON cb.code = fp.book_code
     WHERE cb.tenant_id = ${tenantId} AND fp.code = ${current.fiscal_period_code} AND cb.is_active = true LIMIT 1`
  );
  const fp = (fpRows as CurrentFiscalPeriod[])[0] ?? null;
  if (!fp) return c.json({ error: "Fiscal period not found" }, 422);
  if (fp.status !== "open")
    return c.json({ error: "Fiscal period is not open" }, 422);

  // 6. Get original lines
  const { rows: linesRaw } = await db.execute(
    sql`SELECT * FROM "${sql.raw(S)}"."journal_line" WHERE journal_id = ${current.id} ORDER BY line_group, side`
  );
  const lines = linesRaw as JournalLineRow[];
  if (lines.length === 0)
    return c.json({ error: "Original journal has no lines" }, 422);

  // 7. Get original tags
  const { rows: tagsRaw } = await db.execute(
    sql`SELECT * FROM "${sql.raw(S)}"."journal_tag" WHERE journal_id = ${current.id}`
  );
  const tags = tagsRaw as JournalTagRow[];

  // 8. Build reversal idempotency_code
  const reversalCode = `reverse:${code}`;
  const description =
    body.description ?? `Reversal of ${current.description || code}`;

  // 9. Transaction
  const result = await db.transaction(async (tx: typeof db) => {
    // 9a. Voucher code auto-generation
    const { rows: voucherRows } = await tx.execute(
      sql`SELECT COALESCE(MAX(voucher_code::int), 0) + 1 as next_code
       FROM "${sql.raw(S)}"."journal_header"
       WHERE tenant_id = ${tenantId} AND fiscal_period_code = ${current.fiscal_period_code}`
    );
    const voucherCode = String((voucherRows as { next_code: bigint }[])[0].next_code);

    // 9b. Header chain
    const { nextSequenceNo, prevHeaderHash } = await acquireNextHeaderSequence(tx, tenantId);
    const headerCreatedAt = new Date().toISOString();
    const headerHash = computeHeaderHash({
      prev_header_hash: prevHeaderHash,
      tenant_id: tenantId,
      sequence_no: nextSequenceNo,
      idempotency_code: reversalCode,
      created_at: headerCreatedAt,
    });

    // 9c. Insert journal_header
    const [header] = await tx.insert(journalHeader).values({
      idempotency_code: reversalCode,
      tenant_id: tenantId,
      voucher_code: voucherCode,
      fiscal_period_code: current.fiscal_period_code,
      created_by: userId,
      created_at: new Date(headerCreatedAt),
      sequence_no: nextSequenceNo,
      prev_header_hash: prevHeaderHash,
      header_hash: headerHash,
    }).returning();

    // 9d. Revision chain: compute lines_hash for reversed lines
    const reversedLineInputs: LineHashInput[] = lines.map((l) => ({
      line_group: l.line_group,
      side: l.side === "debit" ? "credit" : "debit",
      account_code: l.account_code,
      department_code: l.department_code,
      counterparty_code: l.counterparty_code,
      tax_class_code: l.tax_class_code,
      tax_rate: l.tax_rate ?? null,
      is_reduced: l.is_reduced,
      amount: String(-parseFloat(String(l.amount))),
      description: l.description,
    }));
    const linesHash = computeLinesHash(reversedLineInputs);
    const revisionHash = computeRevisionHash({
      prev_revision_hash: GENESIS_PREV_HASH,
      idempotency_code: reversalCode,
      revision: 1,
      posted_date: postedDate.toISOString(),
      journal_type: current.journal_type,
      slip_category: current.slip_category,
      adjustment_flag: current.adjustment_flag,
      description: description ?? null,
      source_system: current.source_system ?? null,
      lines_hash: linesHash,
    });

    // 9e. Insert journal (revision=1)
    const [j] = await tx.insert(journal).values({
      tenant_id: tenantId,
      idempotency_code: reversalCode,
      revision: 1,
      posted_date: postedDate,
      journal_type: current.journal_type,
      slip_category: current.slip_category,
      adjustment_flag: current.adjustment_flag,
      description,
      source_system: current.source_system,
      created_by: userId,
      lines_hash: linesHash,
      prev_revision_hash: GENESIS_PREV_HASH,
      revision_hash: revisionHash,
    }).returning();

    // 9f. Insert reversed lines
    await tx.insert(journalLine).values(
      lines.map((l) => ({
        tenant_id: tenantId,
        journal_id: j.id,
        line_group: l.line_group,
        side: l.side === "debit" ? "credit" : "debit",
        account_code: l.account_code,
        department_code: l.department_code,
        counterparty_code: l.counterparty_code,
        tax_class_code: l.tax_class_code,
        tax_rate: l.tax_rate ?? null,
        is_reduced: l.is_reduced,
        amount: String(-parseFloat(String(l.amount))),
        description: l.description,
      })),
    );

    // 9g. Copy tags
    if (tags.length > 0) {
      await tx.insert(journalTag).values(
        tags.map((t) => ({
          tenant_id: tenantId,
          journal_id: j.id,
          tag_code: t.tag_code,
          created_by: userId,
        })),
      );
    }

    return { header, journal: j };
  });

  recordAudit(c, { action: "reverse", entityType: "journal", entityCode: code, revision: 1, detail: { reversal_code: reversalCode } });
  return c.json(
    {
      data: {
        original: {
          idempotency_code: code,
          voucher_code: current.voucher_code,
        },
        reversal: result,
      },
    },
    201
  );
});

export default app;
