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
export const categoryKeySeq = s.sequence("category_key_seq");
export const departmentKeySeq = s.sequence("department_key_seq");
export const counterpartyKeySeq = s.sequence("counterparty_key_seq");
export const voucherKeySeq = s.sequence("voucher_key_seq");
export const journalKeySeq = s.sequence("journal_key_seq");
export const projectKeySeq = s.sequence("project_key_seq");

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
    email: text("email").notNull(),
    external_id: text("external_id"),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    role_key: bigint("role_key", { mode: "number" }).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
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

// ---- category_type (system seed, no revision) ----
export const categoryType = s.table("category_type", {
  code: text("code").primaryKey(),
  entity_type: text("entity_type").notNull(),
  name: text("name").notNull(),
  allow_multiple: boolean("allow_multiple").default(false).notNull(),
});

// ---- category (tenant-scoped, replaces tag/voucher_type/journal_type) ----
export const category = s.table(
  "category",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.category_key_seq')`)
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
    category_type_code: text("category_type_code")
      .notNull()
      .references(() => categoryType.code),
    code: text("code").notNull(),
    name: text("name").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    parent_category_key: bigint("parent_category_key", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("category_tenant_type_code_revision_key").on(
      t.tenant_key,
      t.category_type_code,
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
    parent_counterparty_key: bigint("parent_counterparty_key", { mode: "number" }),
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

export const project = s.table(
  "project",
  {
    key: bigint("key", { mode: "number" })
      .default(sql`nextval('data_stockflow.project_key_seq')`)
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
    department_key: bigint("department_key", { mode: "number" }),
    start_date: timestamp("start_date", { withTimezone: true }),
    end_date: timestamp("end_date", { withTimezone: true }),
    is_active: boolean("is_active").default(true).notNull(),
    parent_project_key: bigint("parent_project_key", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("project_tenant_key_code_revision_key").on(
      t.tenant_key,
      t.code,
      t.revision
    ),
  ]
);

// ============================================================
// トランザクション系
// ============================================================

// voucher: ビジネスグルーピング（posted_date は journal に移動）
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
    voucher_code: text("voucher_code"),
    description: text("description"),
    source_system: text("source_system"),
    sequence_no: integer("sequence_no").notNull(),
    prev_header_hash: text("prev_header_hash").notNull(),
    header_hash: text("header_hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.revision] }),
    uniqueIndex("uq_voucher_code")
      .on(t.tenant_key, t.voucher_code)
      .where(sql`voucher_code IS NOT NULL`),
  ]
);

// journal: posted_at で期間を導出。type keys は category system に移行。
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
    posted_at: timestamp("posted_at", { withTimezone: true }).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    project_key: bigint("project_key", { mode: "number" }).notNull(),
    adjustment_flag: text("adjustment_flag").default("none").notNull(),
    description: text("description"),
    metadata: jsonb("metadata")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
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

// ---- entity_category (polymorphic junction — replaces journal_tag) ----
export const entityCategory = s.table(
  "entity_category",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    category_type_code: text("category_type_code")
      .notNull()
      .references(() => categoryType.code),
    entity_key: bigint("entity_key", { mode: "number" }).notNull(),
    entity_revision: integer("entity_revision"),
    category_key: bigint("category_key", { mode: "number" }).notNull(),
    created_by: bigint("created_by", { mode: "number" }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_entity_category_entity").on(
      t.category_type_code,
      t.entity_key,
      t.entity_revision
    ),
    index("idx_entity_category_category").on(t.category_key),
  ]
);

// ============================================================
// API Key
// ============================================================

export const apiKey = s.table(
  "api_key",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    user_key: bigint("user_key", { mode: "number" }).notNull(),
    tenant_key: bigint("tenant_key", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    key_prefix: text("key_prefix").notNull(),
    key_hash: text("key_hash").notNull(),
    role: text("role").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_api_key_user").on(t.user_key),
    index("idx_api_key_prefix").on(t.key_prefix),
  ]
);

// ============================================================
// ログ系
// ============================================================

export const systemLog = s.table(
  "system_log",
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
    index("idx_system_log_tenant_created").on(t.tenant_key, t.created_at),
    index("idx_system_log_entity").on(t.entity_type, t.entity_key),
  ]
);

export const eventLog = s.table(
  "event_log",
  {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    tenant_key: bigint("tenant_key", { mode: "number" }),
    user_key: bigint("user_key", { mode: "number" }).notNull(),
    user_name: text("user_name").notNull(),
    user_role: text("user_role").notNull(),
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_key: bigint("entity_key", { mode: "number" }).notNull(),
    entity_name: text("entity_name"),
    summary: text("summary").notNull(),
    changes: jsonb("changes"),
    source_ip: text("source_ip"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_event_log_tenant_created").on(t.tenant_key, t.created_at),
    index("idx_event_log_entity").on(t.entity_type, t.entity_key),
  ]
);
