import {
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const s = pgSchema("data_stockflow");

// ============================================================
// マスタ系
// ============================================================

export const book = s.table(
  "book",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    unit_symbol: text("unit_symbol").default("").notNull(),
    unit_position: text("unit_position").default("left").notNull(),
    type_labels: jsonb("type_labels")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    uniqueIndex("book_tenant_id_code_revision_key").on(
      t.tenant_id,
      t.code,
      t.revision
    ),
  ]
);

export const account = s.table(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    book_code: text("book_code").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    is_leaf: boolean("is_leaf").default(true).notNull(),
    account_type: text("account_type").notNull(),
    parent_account_code: text("parent_account_code"),
  },
  (t) => [
    uniqueIndex("account_book_code_code_revision_key").on(
      t.book_code,
      t.code,
      t.revision
    ),
  ]
);

export const tag = s.table(
  "tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    tag_type: text("tag_type").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    uniqueIndex("tag_tenant_id_code_revision_key").on(
      t.tenant_id,
      t.code,
      t.revision
    ),
  ]
);

export const fiscalPeriod = s.table(
  "fiscal_period",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    book_code: text("book_code").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    fiscal_year: integer("fiscal_year").notNull(),
    period_no: integer("period_no").notNull(),
    start_date: timestamp("start_date", { withTimezone: true }).notNull(),
    end_date: timestamp("end_date", { withTimezone: true }).notNull(),
    status: text("status").default("open").notNull(),
  },
  (t) => [
    uniqueIndex("fiscal_period_book_code_code_revision_key").on(
      t.book_code,
      t.code,
      t.revision
    ),
  ]
);

export const department = s.table(
  "department",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    parent_department_code: text("parent_department_code"),
    department_type: text("department_type"),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    uniqueIndex("department_tenant_id_code_revision_key").on(
      t.tenant_id,
      t.code,
      t.revision
    ),
  ]
);

export const taxClass = s.table(
  "tax_class",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    direction: text("direction"),
    is_taxable: boolean("is_taxable").default(true).notNull(),
    deduction_ratio: decimal("deduction_ratio", { precision: 5, scale: 4 }),
    invoice_type: text("invoice_type"),
  },
  (t) => [uniqueIndex("tax_class_code_revision_key").on(t.code, t.revision)]
);

export const counterparty = s.table(
  "counterparty",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    code: text("code")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    display_code: text("display_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    qualified_invoice_number: text("qualified_invoice_number"),
    is_qualified_issuer: boolean("is_qualified_issuer")
      .default(false)
      .notNull(),
  },
  (t) => [
    uniqueIndex("counterparty_tenant_id_code_revision_key").on(
      t.tenant_id,
      t.code,
      t.revision
    ),
  ]
);

export const tenantSetting = s.table(
  "tenant_setting",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    locked_until: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tenant_setting_tenant_id_revision_key").on(
      t.tenant_id,
      t.revision
    ),
  ]
);

export const accountMapping = s.table(
  "account_mapping",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    book_code: text("book_code").notNull(),
    source_system: text("source_system").notNull(),
    source_field: text("source_field").notNull(),
    source_value: text("source_value").notNull(),
    side: text("side").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    account_code: text("account_code").notNull(),
  },
  (t) => [
    uniqueIndex(
      "account_mapping_book_code_source_system_source_field_sourc_key"
    ).on(
      t.book_code,
      t.source_system,
      t.source_field,
      t.source_value,
      t.side,
      t.revision
    ),
  ]
);

export const paymentMapping = s.table(
  "payment_mapping",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    book_code: text("book_code").notNull(),
    source_system: text("source_system").notNull(),
    payment_method: text("payment_method").notNull(),
    revision: integer("revision").default(1).notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    account_code: text("account_code").notNull(),
  },
  (t) => [
    uniqueIndex(
      "payment_mapping_book_code_source_system_payment_method_rev_key"
    ).on(t.book_code, t.source_system, t.payment_method, t.revision),
  ]
);

// ============================================================
// ユーザーマッピング
// ============================================================

export const tenantUser = s.table("tenant_user", {
  id: uuid("id").defaultRandom().primaryKey(),
  external_id: text("external_id").notNull().unique(),
  tenant_id: uuid("tenant_id").notNull(),
  user_id: uuid("user_id")
    .default(sql`gen_random_uuid()`)
    .notNull(),
  role: text("role").default("user").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// 監査ログ
// ============================================================

export const auditLog = s.table(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id"),
    user_id: uuid("user_id").notNull(),
    user_role: text("user_role").notNull(),
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_code: text("entity_code").notNull(),
    revision: integer("revision"),
    detail: text("detail"),
    source_ip: text("source_ip"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_log_tenant_id_created_at_idx").on(t.tenant_id, t.created_at),
    index("audit_log_entity_type_entity_code_idx").on(
      t.entity_type,
      t.entity_code
    ),
  ]
);

// ============================================================
// トランザクション系
// ============================================================

export const journalHeader = s.table(
  "journal_header",
  {
    idempotency_code: text("idempotency_code").primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    voucher_code: text("voucher_code"),
    fiscal_period_code: text("fiscal_period_code").notNull(),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("journal_header_tenant_id_fiscal_period_code_voucher_code_key").on(
      t.tenant_id,
      t.fiscal_period_code,
      t.voucher_code
    ),
  ]
);

export const journal = s.table(
  "journal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id").notNull(),
    idempotency_code: text("idempotency_code").notNull(),
    revision: integer("revision").default(1).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    posted_date: timestamp("posted_date", { withTimezone: true })
      .default(sql`(now()::date)::timestamptz`)
      .notNull(),
    journal_type: text("journal_type").default("normal").notNull(),
    slip_category: text("slip_category").default("ordinary").notNull(),
    adjustment_flag: text("adjustment_flag").default("none").notNull(),
    description: text("description"),
    source_system: text("source_system"),
    created_by: uuid("created_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("journal_idempotency_code_revision_key").on(
      t.idempotency_code,
      t.revision
    ),
  ]
);

export const journalLine = s.table("journal_line", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id").notNull(),
  journal_id: uuid("journal_id").notNull(),
  line_group: integer("line_group").notNull(),
  side: text("side").notNull(),
  account_code: text("account_code").notNull(),
  department_code: text("department_code"),
  counterparty_code: text("counterparty_code"),
  tax_class_code: text("tax_class_code"),
  tax_rate: decimal("tax_rate", { precision: 5, scale: 4 }),
  is_reduced: boolean("is_reduced"),
  amount: decimal("amount", { precision: 15, scale: 0 }).notNull(),
  description: text("description"),
});

export const journalTag = s.table("journal_tag", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id").notNull(),
  journal_id: uuid("journal_id").notNull(),
  tag_code: text("tag_code").notNull(),
  created_by: uuid("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const journalAttachment = s.table("journal_attachment", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id").notNull(),
  idempotency_code: text("idempotency_code").notNull(),
  file_name: text("file_name").notNull(),
  file_path: text("file_path").notNull(),
  mime_type: text("mime_type"),
  created_by: uuid("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
