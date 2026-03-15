import {
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const s = pgSchema("data_stockflow");

// ============================================================
// SEQUENCES
// ============================================================

export const tenantKeySeq = s.sequence("tenant_key_seq");
export const roleKeySeq = s.sequence("role_key_seq");
export const userKeySeq = s.sequence("user_key_seq");
export const bookKeySeq = s.sequence("book_key_seq");
export const accountKeySeq = s.sequence("account_key_seq");
export const fiscalPeriodKeySeq = s.sequence("fiscal_period_key_seq");
export const tagKeySeq = s.sequence("tag_key_seq");
export const departmentKeySeq = s.sequence("department_key_seq");
export const counterpartyKeySeq = s.sequence("counterparty_key_seq");
export const voucherKeySeq = s.sequence("voucher_key_seq");
export const journalKeySeq = s.sequence("journal_key_seq");
export const voucherTypeKeySeq = s.sequence("voucher_type_key_seq");
export const journalTypeKeySeq = s.sequence("journal_type_key_seq");

// ============================================================
// 基盤系
// ============================================================

export const tenant = s.table(
  "tenant",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.tenant_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    name: text("name").notNull(),
    locked_until: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.key, t.revision] })]
);

export const role = s.table(
  "role",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.role_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("role_code_revision_key").on(t.code, t.revision),
  ]
);

export const user = s.table(
  "user",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.user_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    external_id: text("external_id").notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    role_key: bigint("role_key", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("user_tenant_key_code_revision_key").on(t.tenant_key, t.code, t.revision),
  ]
);

// ============================================================
// マスタ系
// ============================================================

export const book = s.table(
  "book",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.book_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
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
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("book_tenant_key_code_revision_key").on(
      t.tenant_key,
      t.code,
      t.revision
    ),
  ]
);

export const account = s.table(
  "account",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.account_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    book_key: bigint("book_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    account_type: text("account_type").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    parent_account_key: bigint("parent_account_key", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("account_book_key_code_revision_key").on(
      t.book_key,
      t.code,
      t.revision
    ),
  ]
);

export const fiscalPeriod = s.table(
  "fiscal_period",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.fiscal_period_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    book_key: bigint("book_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    start_date: timestamp("start_date", { withTimezone: true }).notNull(),
    end_date: timestamp("end_date", { withTimezone: true }).notNull(),
    status: text("status").default("open").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    parent_period_key: bigint("parent_period_key", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("fiscal_period_book_key_code_revision_key").on(
      t.book_key,
      t.code,
      t.revision
    ),
  ]
);

export const tag = s.table(
  "tag",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.tag_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tag_type: text("tag_type").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("tag_tenant_key_code_revision_key").on(
      t.tenant_key,
      t.code,
      t.revision
    ),
  ]
);

export const department = s.table(
  "department",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.department_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    department_type: text("department_type"),
    is_active: boolean("is_active").default(true).notNull(),
    parent_department_key: bigint("parent_department_key", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("department_tenant_key_code_revision_key").on(
      t.tenant_key,
      t.code,
      t.revision
    ),
  ]
);

export const counterparty = s.table(
  "counterparty",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.counterparty_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("counterparty_tenant_key_code_revision_key").on(
      t.tenant_key,
      t.code,
      t.revision
    ),
  ]
);

export const voucherType = s.table(
  "voucher_type",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.voucher_type_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("voucher_type_tenant_key_code_revision_key").on(t.tenant_key, t.code, t.revision),
  ]
);

export const journalType = s.table(
  "journal_type",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.journal_type_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    book_key: bigint("book_key", { mode: "number" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("journal_type_book_key_code_revision_key").on(t.book_key, t.code, t.revision),
  ]
);

// ============================================================
// トランザクション系
// ============================================================

export const voucher = s.table(
  "voucher",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.voucher_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    idempotency_key: text("idempotency_key").notNull().unique(),
    fiscal_period_key: bigint("fiscal_period_key", { mode: "number" }).notNull(),
    voucher_code: text("voucher_code"),
    posted_date: timestamp("posted_date", { withTimezone: true }).notNull(),
    description: text("description"),
    source_system: text("source_system"),
    sequence_no: integer("sequence_no").notNull(),
    prev_header_hash: text("prev_header_hash").notNull(),
    header_hash: text("header_hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("uq_voucher_code")
      .on(t.tenant_key, t.fiscal_period_key, t.voucher_code)
      .where(sql`voucher_code IS NOT NULL`),
  ]
);

export const journal = s.table(
  "journal",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.journal_key_seq')`)
      .notNull(),
    revision: integer("revision").default(1).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_from: timestamp("valid_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    lines_hash: text("lines_hash").notNull(),
    prev_revision_hash: text("prev_revision_hash").notNull(),
    revision_hash: text("revision_hash").notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    voucher_key: bigint("voucher_key", { mode: "number" }).notNull(),
    book_key: bigint("book_key", { mode: "number" }).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    journal_type_key: bigint("journal_type_key", { mode: "number" }).notNull(),
    voucher_type_key: bigint("voucher_type_key", { mode: "number" }).notNull(),
    adjustment_flag: text("adjustment_flag").default("none").notNull(),
    description: text("description"),
  },
  (t) => [primaryKey({ columns: [t.key, t.revision] })]
);

export const journalLine = s.table(
  "journal_line",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    journal_key: bigint("journal_key", { mode: "number" }).notNull(),
    journal_revision: integer("journal_revision").notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    sort_order: integer("sort_order").notNull(),
    side: text("side").notNull(),
    account_key: bigint("account_key", { mode: "number" }).notNull(),
    department_key: bigint("department_key", { mode: "number" }),
    counterparty_key: bigint("counterparty_key", { mode: "number" }),
    amount: decimal("amount", { precision: 15, scale: 0 }).notNull(),
    description: text("description"),
  },
  (t) => [
    foreignKey({
      columns: [t.journal_key, t.journal_revision],
      foreignColumns: [journal.key, journal.revision],
    }),
  ]
);

export const journalTag = s.table(
  "journal_tag",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    journal_key: bigint("journal_key", { mode: "number" }).notNull(),
    journal_revision: integer("journal_revision").notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    tag_key: bigint("tag_key", { mode: "number" }).notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.journal_key, t.journal_revision],
      foreignColumns: [journal.key, journal.revision],
    }),
  ]
);

// ============================================================
// 監査系
// ============================================================

export const auditLog = s.table(
  "audit_log",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    tenant_key: bigint("tenant_key", { mode: "number" }),
    user_key: bigint("user_key", { mode: "number" }).notNull(),
    user_role: text("user_role").notNull(),
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_key: bigint("entity_key", { mode: "number" }).notNull(),
    revision: integer("revision"),
    detail: text("detail"),
    source_ip: text("source_ip"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_audit_log_tenant_created").on(t.tenant_key, t.created_at),
    index("idx_audit_log_entity").on(t.entity_type, t.entity_key),
  ]
);
