// ============================================================
// v2 Types — BIGINT key + revision pattern
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
  external_id: string;
  tenant_key: number;
  role_key: number;
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

export interface CurrentFiscalPeriod extends BaseEntity {
  created_by: number;
  book_key: number;
  code: string;
  start_date: Date;
  end_date: Date;
  status: string;
  is_active: boolean;
  parent_period_key: number | null;
}

export interface CurrentTag extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  tag_type: string;
  is_active: boolean;
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
}

export interface CurrentVoucherType extends BaseEntity {
  created_by: number;
  tenant_key: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface CurrentJournalType extends BaseEntity {
  created_by: number;
  book_key: number;
  code: string;
  name: string;
  is_active: boolean;
}

// ── トランザクション系 ──

export interface VoucherRow extends BaseEntity {
  created_by: number;
  tenant_key: number;
  idempotency_key: string;
  fiscal_period_key: number;
  voucher_code: string | null;
  posted_date: Date;
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
  is_active: boolean;
  journal_type_key: number;
  voucher_type_key: number;
  adjustment_flag: string;
  description: string | null;
}

export interface JournalLineRow {
  uuid: string;
  journal_key: number;
  journal_revision: number;
  tenant_key: number;
  sort_order: number;
  side: string;
  account_key: number;
  department_key: number | null;
  counterparty_key: number | null;
  amount: string; // Decimal from raw SQL
  description: string | null;
}

export interface JournalTagRow {
  uuid: string;
  journal_key: number;
  journal_revision: number;
  tenant_key: number;
  tag_key: number;
  created_by: number;
  created_at: Date;
}

// ── 監査系 ──

export interface AuditLogRow {
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
