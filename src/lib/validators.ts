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
  limit: z.string().optional().openapi({ example: "100" }),
  cursor: z.string().optional().openapi({ description: "Last key from previous page" }),
});

// v2: id path param (BIGINT key exposed as "id")
export const idParamSchema = z.object({
  id: z.string().openapi({ example: "1" }),
});

// ============================================================
// Tenant
// ============================================================

export const tenantResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  locked_until: z.string().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createTenantSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)),
});

export const updateTenantSchema = z.object({
  name: zSanitized(z.string().min(1).max(200)).optional(),
  locked_until: z.string().nullable().optional(),
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
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// User
// ============================================================

export const userResponseSchema = z.object({
  id: z.number(),
  email: z.string(),
  external_id: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  tenant_id: z.number(),
  role_id: z.number(),
  is_active: z.boolean(),
  revision: z.number(),
  created_at: z.string(),
});

export const createUserSchema = z.object({
  email: zSanitized(z.string().email()),
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  role_id: z.number().int().positive(),
});

export const updateUserSchema = z.object({
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  role_id: z.number().int().positive().optional(),
});

// ============================================================
// Book
// ============================================================

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

const typeLabelsSchema = z
  .record(z.string(), z.string().max(50))
  .transform((obj) => {
    const result: Record<string, string> = {};
    for (const t of ACCOUNT_TYPES) result[t] = obj[t] ?? "";
    return result;
  })
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
  code: zSanitized(z.string().min(1).max(100)).optional(),
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
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  account_type: z
    .enum(["asset", "liability", "equity", "revenue", "expense"])
    .optional(),
  parent_account_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Category (replaces tag, voucher_type, journal_type)
// ============================================================

export const categoryResponseSchema = z.object({
  id: z.number(),
  category_type_code: z.string(),
  code: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  parent_category_id: z.number().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createCategorySchema = z.object({
  category_type_code: zSanitized(z.string().min(1).max(100)),
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  parent_category_id: z.number().int().positive().optional(),
});

export const updateCategorySchema = z.object({
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  parent_category_id: z.number().int().positive().nullable().optional(),
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
  code: zSanitized(z.string().min(1).max(100)).optional(),
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
  parent_counterparty_id: z.number().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createCounterpartySchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  parent_counterparty_id: z.number().int().positive().optional(),
});

export const updateCounterpartySchema = z.object({
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  parent_counterparty_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

// (voucher_type and journal_type removed — now handled by category system)

// ============================================================
// Project
// ============================================================

export const projectResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  department_id: z.number().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  is_active: z.boolean(),
  parent_project_id: z.number().nullable(),
  revision: z.number(),
  created_at: z.string(),
});

export const createProjectSchema = z.object({
  code: zSanitized(z.string().min(1).max(50)),
  name: zSanitized(z.string().min(1).max(200)),
  department_id: z.number().int().positive().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  parent_project_id: z.number().int().positive().optional(),
});

export const updateProjectSchema = z.object({
  code: zSanitized(z.string().min(1).max(100)).optional(),
  name: zSanitized(z.string().min(1).max(200)).optional(),
  department_id: z.number().int().positive().nullable().optional(),
  start_date: z.string().datetime().nullable().optional(),
  end_date: z.string().datetime().nullable().optional(),
  parent_project_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

// ============================================================
// Voucher
// ============================================================

export const voucherResponseSchema = z.object({
  id: z.number(),
  idempotency_key: z.string(),
  voucher_code: z.string().nullable(),
  description: z.string().nullable(),
  source_system: z.string().nullable(),
  created_at: z.string(),
});

// ============================================================
// Journal
// ============================================================

export const journalLineResponseSchema = z.object({
  uuid: z.string(),
  sort_order: z.number(),
  side: z.string(),
  account_id: z.number(),
  department_id: z.number().nullable(),
  counterparty_id: z.number().nullable(),
  amount: z.string(),
  description: z.string().nullable(),
});

export const entityCategoryResponseSchema = z.object({
  uuid: z.string(),
  category_type_code: z.string(),
  category_key: z.number(),
  created_at: z.string(),
});

export const journalResponseSchema = z.object({
  id: z.number(),
  voucher_id: z.number(),
  book_id: z.number(),
  posted_at: z.string(),
  revision: z.number(),
  is_active: z.boolean(),
  project_id: z.number(),
  adjustment_flag: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.string()),
  created_at: z.string(),
});

export const journalDetailResponseSchema = journalResponseSchema.extend({
  lines: z.array(journalLineResponseSchema),
  categories: z.array(entityCategoryResponseSchema),
});

export const journalLineSchema = z.object({
  sort_order: z.number().int().min(1),
  side: z.enum(["debit", "credit"]),
  account_id: z.number().int().positive(),
  department_id: z.number().int().positive().nullable().optional(),
  counterparty_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive("amount must be positive"),
  description: z.string().optional(),
});

export const createVoucherSchema = z.object({
  idempotency_key: zSanitized(z.string().min(1)),
  voucher_code: z.string().optional(),
  description: z.string().optional(),
  source_system: z.string().optional(),
  journals: z
    .array(
      z.object({
        book_id: z.number().int().positive(),
        posted_at: z.string().datetime(),
        journal_type_id: z.number().int().positive(),
        project_id: z.number().int().positive(),
        adjustment_flag: z
          .enum(["none", "monthly_adj", "year_end_adj"])
          .default("none"),
        description: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
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
  book_id: z.number().int().positive().optional(),
  posted_at: z.string().datetime().optional(),
  journal_type_id: z.number().int().positive().optional(),
  project_id: z.number().int().positive().optional(),
  adjustment_flag: z
    .enum(["none", "monthly_adj", "year_end_adj"])
    .optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  is_active: z.boolean().optional(),
  lines: z.array(journalLineSchema).min(2),
  tags: z.array(z.number().int().positive()).optional(),
});

// ============================================================
// System Log (renamed from audit_log)
// ============================================================

export const systemLogResponseSchema = z.object({
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

export const systemLogQuerySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  action: z.string().optional(),
  limit: z.string().optional().openapi({ example: "50" }),
  cursor: z.string().optional(),
});

// ============================================================
// Event Log (business-level activity log)
// ============================================================

export const eventLogResponseSchema = z.object({
  uuid: z.string(),
  tenant_id: z.number().nullable(),
  user_name: z.string(),
  user_role: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_name: z.string().nullable(),
  summary: z.string(),
  changes: z.array(z.object({
    field: z.string(),
    from: z.unknown().nullable(),
    to: z.unknown().nullable(),
  })).nullable(),
  source_ip: z.string().nullable(),
  created_at: z.string(),
});

export const eventLogQuerySchema = z.object({
  entity_type: z.string().optional(),
  action: z.string().optional(),
  limit: z.string().optional().openapi({ example: "50" }),
  cursor: z.string().optional(),
});
