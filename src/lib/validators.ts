import { z } from "@hono/zod-openapi";

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

// Common query params for list endpoints
export const listQuerySchema = z.object({
  limit: z.string().optional().openapi({ example: "50" }),
  cursor: z.string().optional(),
});

// Common path param
export const codeParamSchema = z.object({
  code: z.string().openapi({ example: "1000" }),
});

export const idParamSchema = z.object({
  id: z.string().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
});

// ============================================================
// Account
// ============================================================

export const accountResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  name: z.string(),
  unit: z.string(),
  is_active: z.boolean(),
  account_type: z.string(),
  sign: z.number(),
  parent_account_code: z.string().nullable(),
});

export const createAccountSchema = z.object({
  display_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unit: z.string().default("JPY"),
  account_type: z.enum([
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
  ]),
  sign: z.union([z.literal(1), z.literal(-1)]).openapi({
    description: "Normal balance direction: +1 for accounts that normally have a credit balance (liabilities, equity, revenue), -1 for accounts that normally have a debit balance (assets, expenses). This is metadata for reporting and does NOT affect journal entry amounts.",
    example: -1,
  }),
  parent_account_code: z.string().optional(),
  valid_from: z.string().datetime().optional(),
});

export const updateAccountSchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  unit: z.string().optional(),
  account_type: z
    .enum(["asset", "liability", "equity", "revenue", "expense"])
    .optional(),
  sign: z.union([z.literal(1), z.literal(-1)]).openapi({
    description: "Normal balance direction: +1 for credit-normal accounts, -1 for debit-normal accounts.",
  }).optional(),
  parent_account_code: z.string().nullable().optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// Tag
// ============================================================

export const tagResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  name: z.string(),
  tag_type: z.string(),
  is_active: z.boolean(),
});

export const createTagSchema = z.object({
  display_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  tag_type: z.string().min(1).max(100),
  valid_from: z.string().datetime().optional(),
});

export const updateTagSchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  tag_type: z.string().min(1).max(100).optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// Department
// ============================================================

export const departmentResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  name: z.string(),
  parent_department_code: z.string().nullable(),
  department_type: z.string().nullable(),
  is_active: z.boolean(),
});

export const createDepartmentSchema = z.object({
  display_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  parent_department_code: z.string().optional(),
  department_type: z.enum(["statutory", "management"]).optional(),
  valid_from: z.string().datetime().optional(),
});

export const updateDepartmentSchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  parent_department_code: z.string().nullable().optional(),
  department_type: z.enum(["statutory", "management"]).nullable().optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// FiscalPeriod
// ============================================================

export const fiscalPeriodResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  fiscal_year: z.number(),
  period_no: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  status: z.string(),
});

export const createFiscalPeriodSchema = z.object({
  display_code: z.string().min(1).max(50),
  fiscal_year: z.number().int(),
  period_no: z.number().int().min(1).max(13),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  status: z.enum(["open", "closed", "finalized"]).default("open"),
  valid_from: z.string().datetime().optional(),
});

export const updateFiscalPeriodSchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  fiscal_year: z.number().int().optional(),
  period_no: z.number().int().min(1).max(13).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  status: z.enum(["open", "closed", "finalized"]).optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// Counterparty
// ============================================================

export const counterpartyResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  qualified_invoice_number: z.string().nullable(),
  is_qualified_issuer: z.boolean(),
});

export const createCounterpartySchema = z.object({
  display_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  qualified_invoice_number: z.string().optional(),
  is_qualified_issuer: z.boolean().default(false),
  valid_from: z.string().datetime().optional(),
});

export const updateCounterpartySchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  qualified_invoice_number: z.string().nullable().optional(),
  is_qualified_issuer: z.boolean().optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// TaxClass (no tenant_id)
// ============================================================

export const taxClassResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  display_code: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  direction: z.string().nullable(),
  is_taxable: z.boolean(),
  deduction_ratio: z.string().nullable(),
  invoice_type: z.string().nullable(),
});

export const createTaxClassSchema = z.object({
  display_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  direction: z.enum(["purchase", "sale"]).optional(),
  is_taxable: z.boolean().default(true),
  deduction_ratio: z.number().min(0).max(1).optional(),
  invoice_type: z
    .enum(["qualified", "transitional_80", "transitional_50", "none"])
    .optional(),
  valid_from: z.string().datetime().optional(),
});

export const updateTaxClassSchema = z.object({
  display_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  direction: z.enum(["purchase", "sale"]).nullable().optional(),
  is_taxable: z.boolean().optional(),
  deduction_ratio: z.number().min(0).max(1).nullable().optional(),
  invoice_type: z
    .enum(["qualified", "transitional_80", "transitional_50", "none"])
    .nullable()
    .optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// TenantSetting
// ============================================================

export const tenantSettingResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  locked_until: z.string().nullable(),
});

export const createTenantSettingSchema = z.object({
  locked_until: z.string().datetime().nullable().optional(),
  valid_from: z.string().datetime().optional(),
});

export const updateTenantSettingSchema = z.object({
  locked_until: z.string().datetime().nullable().optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// AccountMapping
// ============================================================

export const accountMappingResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  source_system: z.string(),
  source_field: z.string(),
  source_value: z.string(),
  side: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  is_active: z.boolean(),
  account_code: z.string(),
});

export const createAccountMappingSchema = z.object({
  source_system: z.string().min(1),
  source_field: z.string().min(1),
  source_value: z.string().min(1),
  side: z.enum(["debit", "credit"]),
  account_code: z.string().min(1),
  valid_from: z.string().datetime().optional(),
});

export const updateAccountMappingSchema = z.object({
  account_code: z.string().min(1).optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// PaymentMapping
// ============================================================

export const paymentMappingResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  source_system: z.string(),
  payment_method: z.string(),
  revision: z.number(),
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  is_active: z.boolean(),
  account_code: z.string(),
});

export const createPaymentMappingSchema = z.object({
  source_system: z.string().min(1),
  payment_method: z.string().min(1),
  account_code: z.string().min(1),
  valid_from: z.string().datetime().optional(),
});

export const updatePaymentMappingSchema = z.object({
  account_code: z.string().min(1).optional(),
  valid_from: z.string().datetime().optional(),
});

// ============================================================
// Journal
// ============================================================

export const journalLineResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  journal_id: z.string(),
  line_group: z.number(),
  side: z.string().openapi({ description: "Debit or credit side", example: "debit" }),
  account_code: z.string(),
  department_code: z.string().nullable(),
  counterparty_code: z.string().nullable(),
  tax_class_code: z.string().nullable(),
  tax_rate: z.string().nullable(),
  is_reduced: z.boolean().nullable(),
  amount: z.string().openapi({ description: "Always a positive amount. The direction is indicated by the 'side' field.", example: "1000" }),
  description: z.string().nullable(),
});

export const journalTagResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  journal_id: z.string(),
  tag_code: z.string(),
  created_by: z.string(),
  created_at: z.string(),
});

export const journalAttachmentResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  idempotency_code: z.string(),
  file_name: z.string(),
  file_path: z.string(),
  mime_type: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
});

export const journalResponseSchema = z.object({
  voucher_code: z.string().nullable(),
  fiscal_period_code: z.string(),
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
});

export const journalDetailResponseSchema = journalResponseSchema.extend({
  lines: z.array(journalLineResponseSchema),
  tags: z.array(journalTagResponseSchema),
  attachments: z.array(journalAttachmentResponseSchema),
});

export const journalLineSchema = z.object({
  line_group: z.number().int().min(1).openapi({ description: "Line group number for grouping related debit/credit pairs", example: 1 }),
  side: z.enum(["debit", "credit"]).openapi({
    description: "Debit or credit side. The API always accepts positive amounts; the side field determines the accounting direction.",
    example: "debit",
  }),
  account_code: z.string().min(1).openapi({ example: "1000" }),
  department_code: z.string().optional(),
  counterparty_code: z.string().optional(),
  tax_class_code: z.string().optional(),
  tax_rate: z.number().min(0).max(1).optional(),
  is_reduced: z.boolean().optional(),
  amount: z.number().positive("amount must be positive").openapi({
    description: "Always a positive number representing the monetary value. The debit/credit direction is determined by the 'side' field. The API converts internally: debit amounts are stored as negative, credit as positive (SUM=0 invariant).",
    example: 1000,
  }),
  description: z.string().optional(),
});

export const createJournalSchema = z.object({
  idempotency_code: z.string().min(1),
  fiscal_period_code: z.string().min(1),
  posted_date: z.string().datetime(),
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
  source_system: z.string().optional(),
  lines: z.array(journalLineSchema).min(2),
  tags: z.array(z.string()).optional(),
});

export const journalCreateResponseSchema = z.object({
  header: z.object({
    idempotency_code: z.string(),
    tenant_id: z.string(),
    voucher_code: z.string().nullable(),
    fiscal_period_code: z.string(),
    created_by: z.string(),
    created_at: z.string(),
  }),
  journal: z.object({
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
  }),
});

export const updateJournalSchema = z.object({
  posted_date: z.string().datetime().optional(),
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
  lines: z.array(journalLineSchema).min(2),
  tags: z.array(z.string()).optional(),
});
