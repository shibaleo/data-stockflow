import { z } from "@hono/zod-openapi";

// ============================================================
// Sanitisation helpers
// ============================================================

export function sanitize(value: string): string {
  return value.trim();
}

export function zSanitized(schema: z.ZodString = z.string()) {
  return z.preprocess((v) => (typeof v === "string" ? sanitize(v) : v), schema);
}

// ============================================================
// Common response helpers
// ============================================================

export const errorSchema = z.object({
  error: z.string(),
});

export const messageSchema = z.object({
  message: z.string(),
});

export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    next_cursor: z.string().nullable(),
  });
}

export function dataSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({ data: itemSchema });
}

export const listQuerySchema = z.object({
  limit: z.string().optional().openapi({ example: "50" }),
  cursor: z.string().optional(),
});

// v2: id path param (BIGINT key exposed as "id")
export const idParamSchema = z.object({
  id: z.string().openapi({ example: "1" }),
});

// ============================================================
// Role
// ============================================================

export const roleResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  revision: z.number(),
  created_at: z.string(),
});

export const createRoleSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
});

export const updateRoleSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// User
// ============================================================

export const userResponseSchema = z.object({
  id: z.number(),
  external_id: z.string(),
  tenant_id: z.number(),
  role_id: z.number(),
  revision: z.number(),
  created_at: z.string(),
});

export const createUserSchema = z.object({
  external_id: zSanitized(z.string().min(1)),
  role_id: z.number().int().positive(),
});

export const updateUserSchema = z.object({
  role_id: z.number().int().positive().optional(),
});

// ============================================================
// Book
// ============================================================

const typeLabelsSchema = z
  .record(
    z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    z.string().max(50)
  )
  .openapi({ example: { asset: "在庫", revenue: "入荷" } });

const typeLabelsResponseSchema = z.record(z.string(), z.string()).openapi({
  example: { asset: "在庫", revenue: "入荷" },
});

export const bookResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  unit_symbol: z.string(),
  unit_position: z.string(),
  type_labels: typeLabelsResponseSchema,
  is_active: z.boolean(),
  revision: z.number(),
  created_at: z.string(),
});

export const createBookSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  unit: zSanitized(z.string().min(1).max(50)),
  unit_symbol: zSanitized(z.string().max(20)).optional(),
  unit_position: z.enum(["left", "right"]).optional(),
  type_labels: typeLabelsSchema.optional(),
});

export const updateBookSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  unit: zSanitized(z.string().min(1).max(50)).optional(),
  unit_symbol: zSanitized(z.string().max(20)).optional(),
  unit_position: z.enum(["left", "right"]).optional(),
  type_labels: typeLabelsSchema.optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Account
// ============================================================

export const accountResponseSchema = z.object({
  id: z.number(),
  book_id: z.number(),
  code: z.string(),
  name: z.string(),
  account_type: z.string(),
  is_active: z.boolean(),
  parent_account_id: z.number().nullable(),
  sign: z.number(),
  revision: z.number(),
  created_at: z.string(),
});

export const createAccountSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  account_type: z.enum([
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
  ]),
  parent_account_id: z.number().int().positive().optional(),
});

export const updateAccountSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  account_type: z
    .enum(["asset", "liability", "equity", "revenue", "expense"])
    .optional(),
  parent_account_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Fiscal Period
// ============================================================

export const fiscalPeriodResponseSchema = z.object({
  id: z.number(),
  book_id: z.number(),
  code: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  status: z.string(),
  is_active: z.boolean(),
  parent_period_id: z.number().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createFiscalPeriodSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  status: z.enum(["open", "closed", "finalized"]).default("open"),
  parent_period_id: z.number().int().positive().optional(),
});

export const updateFiscalPeriodSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  status: z.enum(["open", "closed", "finalized"]).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Tag
// ============================================================

export const tagResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  tag_type: z.string(),
  is_active: z.boolean(),
  revision: z.number(),
  created_at: z.string(),
});

export const createTagSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  tag_type: zSanitized(z.string().min(1).max(100)),
});

export const updateTagSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  tag_type: zSanitized(z.string().min(1).max(100)).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Department
// ============================================================

export const departmentResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  department_type: z.string().nullable(),
  is_active: z.boolean(),
  parent_department_id: z.number().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createDepartmentSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  parent_department_id: z.number().int().positive().optional(),
  department_type: z.string().optional(),
});

export const updateDepartmentSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  parent_department_id: z.number().int().positive().nullable().optional(),
  department_type: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Counterparty
// ============================================================

export const counterpartyResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  qualified_invoice_number: z.string().nullable(),
  is_qualified_issuer: z.boolean(),
  revision: z.number(),
  created_at: z.string(),
});

export const createCounterpartySchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  qualified_invoice_number: z.string().optional(),
  is_qualified_issuer: z.boolean().default(false),
});

export const updateCounterpartySchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  qualified_invoice_number: z.string().nullable().optional(),
  is_qualified_issuer: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Voucher
// ============================================================

export const voucherResponseSchema = z.object({
  id: z.number(),
  book_id: z.number(),
  fiscal_period_id: z.number(),
  idempotency_key: z.string(),
  voucher_code: z.string().nullable(),
  posted_date: z.string(),
  description: z.string().nullable(),
  source_system: z.string().nullable(),
  created_at: z.string(),
});

// ============================================================
// Journal
// ============================================================

export const journalLineResponseSchema = z.object({
  uuid: z.string(),
  line_group: z.number(),
  side: z.string(),
  account_id: z.number(),
  department_id: z.number().nullable(),
  counterparty_id: z.number().nullable(),
  amount: z.string(),
  description: z.string().nullable(),
});

export const journalTagResponseSchema = z.object({
  uuid: z.string(),
  tag_id: z.number(),
  created_at: z.string(),
});

export const journalResponseSchema = z.object({
  id: z.number(),
  voucher_id: z.number(),
  revision: z.number(),
  is_active: z.boolean(),
  journal_type: z.string(),
  slip_category: z.string(),
  adjustment_flag: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
});

export const journalDetailResponseSchema = journalResponseSchema.extend({
  lines: z.array(journalLineResponseSchema),
  tags: z.array(journalTagResponseSchema),
});

export const journalLineSchema = z.object({
  line_group: z.number().int().min(1),
  side: z.enum(["debit", "credit"]),
  account_id: z.number().int().positive(),
  department_id: z.number().int().positive().optional(),
  counterparty_id: z.number().int().positive().optional(),
  amount: z.number().positive("amount must be positive"),
  description: z.string().optional(),
});

export const createVoucherSchema = z.object({
  idempotency_key: zSanitized(z.string().min(1)),
  book_id: z.number().int().positive(),
  fiscal_period_id: z.number().int().positive(),
  voucher_code: z.string().optional(),
  posted_date: z.string().datetime(),
  description: z.string().optional(),
  source_system: z.string().optional(),
  journals: z
    .array(
      z.object({
        journal_type: z
          .enum(["normal", "closing", "prior_adj", "auto"])
          .default("normal"),
        slip_category: z
          .enum(["ordinary", "transfer", "receipt", "payment"])
          .default("ordinary"),
        adjustment_flag: z
          .enum(["none", "monthly_adj", "year_end_adj"])
          .default("none"),
        description: z.string().optional(),
        lines: z.array(journalLineSchema).min(2),
        tags: z.array(z.number().int().positive()).optional(),
      })
    )
    .min(1),
});

export const voucherDetailResponseSchema = voucherResponseSchema.extend({
  journals: z.array(journalDetailResponseSchema),
});

export const updateJournalSchema = z.object({
  journal_type: z
    .enum(["normal", "closing", "prior_adj", "auto"])
    .optional(),
  slip_category: z
    .enum(["ordinary", "transfer", "receipt", "payment"])
    .optional(),
  adjustment_flag: z
    .enum(["none", "monthly_adj", "year_end_adj"])
    .optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  lines: z.array(journalLineSchema).min(2),
  tags: z.array(z.number().int().positive()).optional(),
});

// ============================================================
// Audit Log
// ============================================================

export const auditLogResponseSchema = z.object({
  uuid: z.string(),
  tenant_id: z.number().nullable(),
  user_id: z.number(),
  user_role: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.number(),
  revision: z.number().nullable(),
  detail: z.string().nullable(),
  source_ip: z.string().nullable(),
  created_at: z.string(),
});

export const auditLogQuerySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  action: z.string().optional(),
  limit: z.string().optional().openapi({ example: "50" }),
  cursor: z.string().optional(),
});
