import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { prisma } from "@/lib/prisma";
import {
  listCurrent,
  getCurrent,
  getMaxRevision,
  decodeCursor,
  encodeCursor,
} from "@/lib/append-only";
import {
  listQuerySchema,
  codeParamSchema,
  errorSchema,
  messageSchema,
  paginatedSchema,
  dataSchema,
  createJournalSchema,
  updateJournalSchema,
  journalResponseSchema,
  journalDetailResponseSchema,
  journalCreateResponseSchema,
} from "@/lib/validators";
import type { AppVariables } from "@/middleware/context";
import { requireTenant, requireAuth, requireRole } from "@/middleware/guards";
import type {
  CurrentJournal,
  CurrentFiscalPeriod,
  CurrentTenantSetting,
  CurrentAccount,
  CurrentDepartment,
  CurrentCounterparty,
  CurrentTaxClass,
  CurrentTag,
  JournalLineRow,
  JournalTagRow,
  JournalAttachmentRow,
} from "@/lib/types";
import { recordAudit } from "@/lib/audit";

const S = "data_accounting";

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.use("*", requireTenant(), requireAuth());

const list = createRoute({
  method: "get",
  path: "/",
  tags: ["Journals"],
  summary: "List current journals",
  request: { query: listQuerySchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: paginatedSchema(journalResponseSchema) } } },
  },
});

const get = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Journals"],
  summary: "Get journal by idempotency code (with lines, tags, attachments)",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Success", content: { "application/json": { schema: dataSchema(journalDetailResponseSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const create = createRoute({
  method: "post",
  path: "/",
  tags: ["Journals"],
  summary: "Create journal",
  request: { body: { content: { "application/json": { schema: createJournalSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: dataSchema(journalCreateResponseSchema) } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const update = createRoute({
  method: "put",
  path: "/{code}",
  tags: ["Journals"],
  summary: "Update journal (new revision)",
  request: { params: codeParamSchema, body: { content: { "application/json": { schema: updateJournalSchema } } } },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: dataSchema(z.object({
      id: z.string(),
      tenant_id: z.string(),
      idempotency_code: z.string(),
      revision: z.number(),
      is_active: z.boolean(),
      posted_date: z.string(),
      journal_type: z.string(),
      slip_category: z.string(),
      adjustment_flag: z.string(),
      description: z.string().nullable(),
      source_system: z.string().nullable(),
      created_by: z.string(),
      created_at: z.string(),
    })) } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

const del = createRoute({
  method: "delete",
  path: "/{code}",
  tags: ["Journals"],
  summary: "Deactivate journal",
  request: { params: codeParamSchema },
  responses: {
    200: { description: "Deactivated", content: { "application/json": { schema: messageSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
    422: { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
  },
});

// ---- Handlers ----

app.openapi(list, async (c) => {
  const tenantId = c.get("tenantId");
  const { limit: limitStr, cursor: cursorParam } = c.req.valid("query");
  const limit = Math.min(Number(limitStr || 50), 200);

  const rows = await listCurrent<CurrentJournal>(
    "current_journal",
    { tenant_id: tenantId },
    { limit, cursor: cursorParam ? decodeCursor(cursorParam) : undefined }
  );

  return c.json({
    data: rows,
    next_cursor:
      rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  }, 200);
});

app.openapi(get, async (c) => {
  const tenantId = c.get("tenantId");
  const { code } = c.req.valid("param");

  const journal = await getCurrent<CurrentJournal>("current_journal", {
    tenant_id: tenantId,
    idempotency_code: code,
  });
  if (!journal) return c.json({ error: "Not found" }, 404);

  const [lines, tags, attachments] = await Promise.all([
    prisma.$queryRawUnsafe<JournalLineRow[]>(
      `SELECT * FROM "${S}"."journal_line" WHERE journal_id = $1 ORDER BY line_group, side`,
      journal.id
    ),
    prisma.$queryRawUnsafe<JournalTagRow[]>(
      `SELECT * FROM "${S}"."journal_tag" WHERE journal_id = $1`,
      journal.id
    ),
    prisma.$queryRawUnsafe<JournalAttachmentRow[]>(
      `SELECT * FROM "${S}"."journal_attachment" WHERE idempotency_code = $1`,
      code
    ),
  ]);

  // Convert signed DB amounts back to positive for API response
  const transformedLines = lines.map((l) => ({
    ...l,
    amount: String(Math.abs(parseFloat(String(l.amount)))),
  }));

  return c.json({ data: { ...journal, lines: transformedLines, tags, attachments } }, 200);
});

app.use(create.getRoutingPath(), requireRole("admin", "user"));
app.openapi(create, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const body = c.req.valid("json");

  // 1. Validate fiscal_period exists and is open
  const fp = await getCurrent<CurrentFiscalPeriod>(
    "current_fiscal_period",
    { tenant_id: tenantId, code: body.fiscal_period_code }
  );
  if (!fp)
    return c.json({ error: "fiscal_period_code not found" }, 422);
  if (fp.status !== "open")
    return c.json({ error: "Fiscal period is not open" }, 422);

  // 2. Check locked_until
  const setting = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (
    setting?.locked_until &&
    new Date(body.posted_date) <= new Date(setting.locked_until)
  ) {
    return c.json(
      { error: "posted_date is within locked period" },
      422
    );
  }

  // 3. journal_type + role check
  if (
    ["closing", "prior_adj"].includes(body.journal_type) &&
    c.get("userRole") === "user"
  ) {
    return c.json(
      { error: "Insufficient role for this journal_type" },
      403
    );
  }

  // 4. App-layer balance check (debit total must equal credit total)
  const debitTotal = body.lines
    .filter((l) => l.side === "debit")
    .reduce((acc, l) => acc + l.amount, 0);
  const creditTotal = body.lines
    .filter((l) => l.side === "credit")
    .reduce((acc, l) => acc + l.amount, 0);
  if (debitTotal !== creditTotal) {
    return c.json(
      { error: `Lines do not balance: debit total (${debitTotal}) != credit total (${creditTotal})` },
      422
    );
  }

  // Convert to signed amounts for DB (debit=negative, credit=positive)
  const signedLines = body.lines.map((l) => ({
    ...l,
    amount: l.side === "debit" ? -l.amount : l.amount,
  }));

  // 5. Validate reference codes
  const accountCodes = [...new Set(body.lines.map((l) => l.account_code))];
  for (const ac of accountCodes) {
    const a = await getCurrent<CurrentAccount>("current_account", {
      tenant_id: tenantId,
      code: ac,
    });
    if (!a)
      return c.json({ error: `account_code '${ac}' not found` }, 422);
  }

  const deptCodes = [
    ...new Set(
      body.lines.map((l) => l.department_code).filter(Boolean) as string[]
    ),
  ];
  for (const dc of deptCodes) {
    const d = await getCurrent<CurrentDepartment>("current_department", {
      tenant_id: tenantId,
      code: dc,
    });
    if (!d)
      return c.json(
        { error: `department_code '${dc}' not found` },
        422
      );
  }

  const cpCodes = [
    ...new Set(
      body.lines
        .map((l) => l.counterparty_code)
        .filter(Boolean) as string[]
    ),
  ];
  for (const cc of cpCodes) {
    const cp = await getCurrent<CurrentCounterparty>(
      "current_counterparty",
      { tenant_id: tenantId, code: cc }
    );
    if (!cp)
      return c.json(
        { error: `counterparty_code '${cc}' not found` },
        422
      );
  }

  const tcCodes = [
    ...new Set(
      body.lines.map((l) => l.tax_class_code).filter(Boolean) as string[]
    ),
  ];
  for (const tc of tcCodes) {
    const t = await getCurrent<CurrentTaxClass>("current_tax_class", {
      code: tc,
    });
    if (!t)
      return c.json(
        { error: `tax_class_code '${tc}' not found` },
        422
      );
  }

  if (body.tags?.length) {
    for (const tagCode of body.tags) {
      const t = await getCurrent<CurrentTag>("current_tag", {
        tenant_id: tenantId,
        code: tagCode,
      });
      if (!t)
        return c.json({ error: `tag_code '${tagCode}' not found` }, 422);
    }
  }

  // 6. Transaction
  const result = await prisma.$transaction(async (tx) => {
    // 6a. Voucher code auto-generation
    const voucherRows = await tx.$queryRawUnsafe<
      { next_code: bigint }[]
    >(
      `SELECT COALESCE(MAX(voucher_code::int), 0) + 1 as next_code
       FROM "${S}"."journal_header"
       WHERE tenant_id = $1 AND fiscal_period_code = $2`,
      tenantId,
      body.fiscal_period_code
    );
    const voucherCode = String(voucherRows[0].next_code);

    // 6b. Insert journal_header
    const header = await tx.journalHeader.create({
      data: {
        idempotency_code: body.idempotency_code,
        tenant_id: tenantId,
        voucher_code: voucherCode,
        fiscal_period_code: body.fiscal_period_code,
        created_by: userId,
      },
    });

    // 6c. Insert journal (revision=1)
    const journal = await tx.journal.create({
      data: {
        tenant_id: tenantId,
        idempotency_code: body.idempotency_code,
        revision: 1,
        posted_date: new Date(body.posted_date),
        journal_type: body.journal_type,
        slip_category: body.slip_category,
        adjustment_flag: body.adjustment_flag,
        description: body.description,
        source_system: body.source_system,
        created_by: userId,
      },
    });

    // 6d. Insert journal_lines (using signed amounts)
    await tx.journalLine.createMany({
      data: signedLines.map((l) => ({
        tenant_id: tenantId,
        journal_id: journal.id,
        line_group: l.line_group,
        side: l.side,
        account_code: l.account_code,
        department_code: l.department_code,
        counterparty_code: l.counterparty_code,
        tax_class_code: l.tax_class_code,
        tax_rate: l.tax_rate,
        is_reduced: l.is_reduced,
        amount: l.amount,
        description: l.description,
      })),
    });

    // 6e. Insert journal_tags
    if (body.tags?.length) {
      await tx.journalTag.createMany({
        data: body.tags.map((tagCode) => ({
          tenant_id: tenantId,
          journal_id: journal.id,
          tag_code: tagCode,
          created_by: userId,
        })),
      });
    }

    return { header, journal };
  });

  recordAudit(c, { action: "create", entityType: "journal", entityCode: body.idempotency_code, revision: 1 });
  return c.json({ data: result }, 201);
});

app.use(update.getRoutingPath(), requireRole("admin", "user"));
app.openapi(update, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");
  const body = c.req.valid("json");

  // 1. Get current journal
  const current = await getCurrent<CurrentJournal>("current_journal", {
    tenant_id: tenantId,
    idempotency_code: code,
  });
  if (!current) return c.json({ error: "Not found" }, 404);

  // 2. Check locked_until
  const postedDate = body.posted_date
    ? new Date(body.posted_date)
    : current.posted_date;
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

  // 3. journal_type + role check
  const jType = body.journal_type ?? current.journal_type;
  if (
    ["closing", "prior_adj"].includes(jType) &&
    c.get("userRole") === "user"
  ) {
    return c.json(
      { error: "Insufficient role for this journal_type" },
      403
    );
  }

  // 4. Balance check (debit total must equal credit total)
  const debitTotal = body.lines
    .filter((l) => l.side === "debit")
    .reduce((acc, l) => acc + l.amount, 0);
  const creditTotal = body.lines
    .filter((l) => l.side === "credit")
    .reduce((acc, l) => acc + l.amount, 0);
  if (debitTotal !== creditTotal) {
    return c.json(
      { error: `Lines do not balance: debit total (${debitTotal}) != credit total (${creditTotal})` },
      422
    );
  }

  // Convert to signed amounts for DB (debit=negative, credit=positive)
  const signedLines = body.lines.map((l) => ({
    ...l,
    amount: l.side === "debit" ? -l.amount : l.amount,
  }));

  // 5. Validate reference codes (same as POST)
  const accountCodes = [...new Set(body.lines.map((l) => l.account_code))];
  for (const ac of accountCodes) {
    const a = await getCurrent<CurrentAccount>("current_account", {
      tenant_id: tenantId,
      code: ac,
    });
    if (!a)
      return c.json({ error: `account_code '${ac}' not found` }, 422);
  }

  if (body.tags?.length) {
    for (const tagCode of body.tags) {
      const t = await getCurrent<CurrentTag>("current_tag", {
        tenant_id: tenantId,
        code: tagCode,
      });
      if (!t)
        return c.json({ error: `tag_code '${tagCode}' not found` }, 422);
    }
  }

  // 6. Get max revision
  const maxRev = await getMaxRevision("journal", {
    idempotency_code: code,
  });

  // 7. Transaction
  const result = await prisma.$transaction(async (tx) => {
    const journal = await tx.journal.create({
      data: {
        tenant_id: tenantId,
        idempotency_code: code,
        revision: maxRev + 1,
        posted_date: postedDate,
        journal_type: jType,
        slip_category: body.slip_category ?? current.slip_category,
        adjustment_flag: body.adjustment_flag ?? current.adjustment_flag,
        description:
          body.description !== undefined
            ? body.description
            : current.description,
        source_system: current.source_system,
        created_by: userId,
      },
    });

    await tx.journalLine.createMany({
      data: signedLines.map((l) => ({
        tenant_id: tenantId,
        journal_id: journal.id,
        line_group: l.line_group,
        side: l.side,
        account_code: l.account_code,
        department_code: l.department_code,
        counterparty_code: l.counterparty_code,
        tax_class_code: l.tax_class_code,
        tax_rate: l.tax_rate,
        is_reduced: l.is_reduced,
        amount: l.amount,
        description: l.description,
      })),
    });

    if (body.tags?.length) {
      await tx.journalTag.createMany({
        data: body.tags.map((tagCode) => ({
          tenant_id: tenantId,
          journal_id: journal.id,
          tag_code: tagCode,
          created_by: userId,
        })),
      });
    }

    return journal;
  });

  recordAudit(c, { action: "update", entityType: "journal", entityCode: code, revision: maxRev + 1 });
  return c.json({ data: result }, 200);
});

app.use(del.getRoutingPath(), requireRole("admin", "user"));
app.openapi(del, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const { code } = c.req.valid("param");

  const current = await getCurrent<CurrentJournal>("current_journal", {
    tenant_id: tenantId,
    idempotency_code: code,
  });
  if (!current) return c.json({ error: "Not found" }, 404);

  // Check locked_until
  const setting = await getCurrent<CurrentTenantSetting>(
    "current_tenant_setting",
    { tenant_id: tenantId }
  );
  if (
    setting?.locked_until &&
    current.posted_date <= new Date(setting.locked_until)
  ) {
    return c.json(
      { error: "posted_date is within locked period" },
      422
    );
  }

  // journal_type + role check
  if (
    ["closing", "prior_adj"].includes(current.journal_type) &&
    c.get("userRole") === "user"
  ) {
    return c.json(
      { error: "Insufficient role for this journal_type" },
      403
    );
  }

  const maxRev = await getMaxRevision("journal", {
    idempotency_code: code,
  });

  // Insert deactivation revision (no lines needed)
  await prisma.journal.create({
    data: {
      tenant_id: tenantId,
      idempotency_code: code,
      revision: maxRev + 1,
      is_active: false,
      posted_date: current.posted_date,
      journal_type: current.journal_type,
      slip_category: current.slip_category,
      adjustment_flag: current.adjustment_flag,
      description: current.description,
      source_system: current.source_system,
      created_by: userId,
    },
  });

  recordAudit(c, { action: "deactivate", entityType: "journal", entityCode: code, revision: maxRev + 1 });
  return c.json({ message: "Deactivated" }, 200);
});

export default app;
