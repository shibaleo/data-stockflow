export interface CurrentBook {
  id: string;
  tenant_id: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  unit: string;
  unit_symbol: string;
  unit_position: string;
  type_labels: Record<string, string>;
  is_active: boolean;
}

export interface CurrentAccount {
  id: string;
  book_code: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  is_active: boolean;
  is_leaf: boolean;
  account_type: string;
  sign: number;
  parent_account_code: string | null;
  unit_symbol: string;
  unit_position: string;
}

export interface CurrentTag {
  id: string;
  tenant_id: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  tag_type: string;
  is_active: boolean;
}

export interface CurrentFiscalPeriod {
  id: string;
  book_code: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  fiscal_year: number;
  period_no: number;
  start_date: Date;
  end_date: Date;
  status: string;
}

export interface CurrentDepartment {
  id: string;
  tenant_id: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  parent_department_code: string | null;
  department_type: string | null;
  is_active: boolean;
}

export interface CurrentTaxClass {
  id: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  is_active: boolean;
  direction: string | null;
  is_taxable: boolean;
  deduction_ratio: string | null; // Decimal comes as string from raw SQL
  invoice_type: string | null;
}

export interface CurrentCounterparty {
  id: string;
  tenant_id: string;
  code: string;
  display_code: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  name: string;
  is_active: boolean;
  qualified_invoice_number: string | null;
  is_qualified_issuer: boolean;
}

export interface CurrentTenantSetting {
  id: string;
  tenant_id: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  locked_until: Date | null;
}

export interface CurrentAccountMapping {
  id: string;
  book_code: string;
  source_system: string;
  source_field: string;
  source_value: string;
  side: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  is_active: boolean;
  account_code: string;
}

export interface CurrentPaymentMapping {
  id: string;
  book_code: string;
  source_system: string;
  payment_method: string;
  revision: number;
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  created_at: Date;
  is_active: boolean;
  account_code: string;
}

export interface CurrentJournal {
  voucher_code: string | null;
  fiscal_period_code: string;
  id: string;
  tenant_id: string;
  idempotency_code: string;
  revision: number;
  is_active: boolean;
  posted_date: Date;
  journal_type: string;
  slip_category: string;
  adjustment_flag: string;
  description: string | null;
  source_system: string | null;
  created_by: string;
  created_at: Date;
  // Hash chain
  lines_hash: string;
  prev_revision_hash: string;
  revision_hash: string;
}

export interface JournalLineRow {
  id: string;
  tenant_id: string;
  journal_id: string;
  line_group: number;
  side: string;
  account_code: string;
  department_code: string | null;
  counterparty_code: string | null;
  tax_class_code: string | null;
  tax_rate: string | null; // Decimal from raw SQL
  is_reduced: boolean | null;
  amount: string; // Decimal from raw SQL
  description: string | null;
}

export interface JournalTagRow {
  id: string;
  tenant_id: string;
  journal_id: string;
  tag_code: string;
  created_by: string;
  created_at: Date;
}

export interface JournalAttachmentRow {
  id: string;
  tenant_id: string;
  idempotency_code: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  created_by: string;
  created_at: Date;
}
