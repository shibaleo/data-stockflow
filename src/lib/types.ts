// ============================================================
// v3 Types — Category system + posted_at on journal
// ============================================================

// Common fields for all append-only tables
interface BaseEntity {
  key: number;
  revision: number;
  created_at: Date;
  valid_from: Date;
  valid_to: Date | null;
  lines_hash: string;
  prev_revision_hash: string;
  revision_hash: string;
}

// ── 基盤系 ──

export interface CurrentTenant extends BaseEntity {
  name: string;
  locked_until: Date | null;
}

export interface CurrentRole extends BaseEntity {
  code: string;
  name: string;
  is_active: boolean;
}

export interface CurrentUser extends BaseEntity {
  code: string;
  name: string;
  email: string;
  external_id: string | null;
  tenant_key: number;
  role_key: number;
  is_active: boolean;
}

// ── マスタ系 ──

export interface CurrentBook extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  unit: string;
  unit_symbol: string;
  unit_position: string;
  type_labels: Record<string, string>;
  is_active: boolean;
}

export interface CurrentAccount extends BaseEntity {
  created_by: number;
  book_key: number;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  parent_account_key: number | null;
  sign: number; // from current_account view
}

export interface CurrentPeriod extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  start_date: Date;
  end_date: Date;
  status: string;
  is_active: boolean;
  parent_period_key: number | null;
}

export interface CurrentCategory extends BaseEntity {
  created_by: number;
  tenant_key: number;
  category_type_code: string;
  code: string;
  name: string;
  is_active: boolean;
  parent_category_key: number | null;
}

export interface CurrentDepartment extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  department_type: string | null;
  is_active: boolean;
  parent_department_key: number | null;
}

export interface CurrentCounterparty extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  is_active: boolean;
  parent_counterparty_key: number | null;
}

export interface CurrentProject extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  department_key: number | null;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  parent_project_key: number | null;
}

// ── トランザクション系 ──

export interface VoucherRow extends BaseEntity {
  created_by: number;
  tenant_key: number;
  idempotency_key: string;
  voucher_code: string | null;
  description: string | null;
  source_system: string | null;
  sequence_no: number;
  prev_header_hash: string;
  header_hash: string;
}

export interface CurrentJournal extends BaseEntity {
  created_by: number;
  tenant_key: number;
  voucher_key: number;
  book_key: number;
  period_key: number;
  posted_at: Date;
  is_active: boolean;
  project_key: number;
  adjustment_flag: string;
  description: string | null;
  metadata: Record<string, string>;
}

export interface JournalLineRow {
  uuid: string;
  journal_key: number;
  journal_revision: number;
  tenant_key: number;
  sort_order: number;
  side: string;
  account_key: number;
  department_key: number;
  counterparty_key: number;
  amount: string; // Decimal from raw SQL
  description: string | null;
}

export interface EntityCategoryRow {
  uuid: string;
  tenant_key: number;
  category_type_code: string;
  entity_key: number;
  entity_revision: number | null;
  category_key: number;
  created_by: number;
  created_at: Date;
}

// ── システムログ ──

export interface SystemLogRow {
  uuid: string;
  tenant_key: number | null;
  user_key: number;
  user_role: string;
  action: string;
  entity_type: string;
  entity_key: number;
  revision: number | null;
  detail: string | null;
  source_ip: string | null;
  created_at: Date;
}

// ── イベントログ ──

export interface EventLogRow {
  uuid: string;
  tenant_key: number | null;
  user_key: number;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_key: number;
  entity_name: string | null;
  summary: string;
  changes: unknown | null;
  source_ip: string | null;
  created_at: Date;
}
