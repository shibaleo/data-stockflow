# 007: Initial Balance Adjustment Procedure

## Overview

Zaim API does not expose account opening balances. The `raw_zaim__account` table only
contains metadata (name, sort, active flag) — no balance field.
Therefore, initial balances must be derived by comparing Zaim app balances with the
cumulative transaction totals already migrated into `data_stockflow`.

## Formula

```
initial_balance = zaim_app_balance - zaim_transaction_net
```

Where `zaim_transaction_net` is computed from `fct_zaim_transactions`:

```sql
SELECT
  SUM(CASE
    WHEN to_account_name   = '<ZAIM_ACCOUNT>' THEN  amount   -- inflow
    WHEN from_account_name = '<ZAIM_ACCOUNT>' THEN -amount   -- outflow
  END) AS net
FROM data_presentation.fct_zaim_transactions
WHERE from_account_name = '<ZAIM_ACCOUNT>'
   OR to_account_name   = '<ZAIM_ACCOUNT>';
```

## Journal Structure

All initial balances are recorded in a **single journal entry** under
`idempotency_code = 'initial_balance:all'`, posted on `2025-03-31` (the day after
Zaim custom-category migration started on 2025-03-20, closing the pre-migration period).

Each BS account gets one `line_group`:

| Account Type | Debit                  | Credit                 |
|-------------|------------------------|------------------------|
| Asset       | BS account (amount)    | Capital suspense 3100  |
| Liability   | Capital suspense 3100  | BS account (amount)    |

Signed amounts follow the system convention: debit = negative, credit = positive.

## Accounts Adjusted (2025-03-31)

### Assets

| Code | Name           | Initial Balance |
|------|----------------|---------------:|
| 1110 | Cash           |         26,523 |
| 1120 | Mobile SUICA   |         14,539 |
| 1130 | PAYPAY         |          3,241 |
| 1140 | PASMO          |          2,741 |
| 1210 | Bank 82        |        207,954 |
| 1220 | JRE Bank       |        317,581 |
| 1450 | Prepaid (CPA)  |        246,125 |
| 1511 | MUFG           |        550,125 |
| 1512 | JP Post        |         11,218 |
| 1513 | Rakuten Bank   |             21 |
| 1514 | SMBC           |        115,944 |

### Liabilities

| Code | Name             | Initial Balance |
|------|------------------|---------------:|
| 2110 | VIEW Card        |        131,070 |
| 2120 | Rakuten MC       |          2,265 |
| 2140 | SMBC Card        |         40,915 |
| 2160 | Yodobashi        |         98,071 |
| 2510 | Public Loan      |      3,144,000 |
| 2521 | CPA Tuition Loan |        731,500 |
| 2522 | Ortho Loan       |        720,000 |

## Re-running / Updating

The journal uses `idempotency_code = 'initial_balance:all'`. To update:

1. Delete existing entry:

```sql
DELETE FROM data_stockflow.journal_tag
WHERE journal_id IN (
  SELECT id FROM data_stockflow.journal
  WHERE idempotency_code = 'initial_balance:all'
    AND tenant_id = '00000000-0000-0000-0000-000000000001'
);

DELETE FROM data_stockflow.journal_line
WHERE journal_id IN (
  SELECT id FROM data_stockflow.journal
  WHERE idempotency_code = 'initial_balance:all'
    AND tenant_id = '00000000-0000-0000-0000-000000000001'
);

DELETE FROM data_stockflow.journal
WHERE idempotency_code = 'initial_balance:all'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM data_stockflow.journal_header
WHERE idempotency_code = 'initial_balance:all'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';
```

2. Re-insert with updated amounts (see migration SQL below).

## Migration SQL

```sql
WITH fp AS (
  SELECT code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND display_code = '2025-03'
),
acct AS (
  SELECT code, display_code FROM data_stockflow.current_account
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
capital AS (
  SELECT code FROM acct WHERE display_code = '3100'
),
new_header AS (
  INSERT INTO data_stockflow.journal_header
    (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'initial_balance:all', '00000000-0000-0000-0000-000000000001', fp.code,
    '00000000-0000-0000-0000-000000000099'
  FROM fp
  WHERE NOT EXISTS (
    SELECT 1 FROM data_stockflow.journal_header jh
    WHERE jh.idempotency_code = 'initial_balance:all'
      AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
  )
  RETURNING idempotency_code
),
new_journal AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date,
     journal_type, slip_category, description, source_system, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nh.idempotency_code, 1,
    '2025-03-31'::timestamptz, 'auto', 'transfer',
    'Initial balance adjustment - all BS accounts',
    'manual', '00000000-0000-0000-0000-000000000099'
  FROM new_header nh
  RETURNING id
),
-- Update the VALUES below with current initial balances
adjustments(account_code, account_type, initial_balance, line_no) AS (VALUES
  ('1110', 'asset',     26523,  1),
  ('1120', 'asset',     14539,  2),
  ('1130', 'asset',      3241,  3),
  ('1140', 'asset',      2741,  4),
  ('1210', 'asset',    207954,  5),
  ('1220', 'asset',    317581,  6),
  ('1511', 'asset',    550125,  7),
  ('1512', 'asset',     11218,  8),
  ('1513', 'asset',        21,  9),
  ('1514', 'asset',    115944, 10),
  ('1450', 'asset',    246125, 11),
  ('2110', 'liability', 131070, 12),
  ('2120', 'liability',   2265, 13),
  ('2140', 'liability',  40915, 14),
  ('2160', 'liability',  98071, 15),
  ('2510', 'liability', 3144000, 16),
  ('2521', 'liability', 731500, 17),
  ('2522', 'liability', 720000, 18)
),
ins_asset_debit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, adj.line_no, 'debit',
    a.code, -adj.initial_balance
  FROM new_journal nj, adjustments adj
  JOIN acct a ON a.display_code = adj.account_code
  WHERE adj.account_type = 'asset'
  RETURNING 1 AS x
),
ins_asset_credit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, adj.line_no, 'credit',
    c.code, adj.initial_balance
  FROM new_journal nj, adjustments adj, capital c
  WHERE adj.account_type = 'asset'
  RETURNING 1 AS x
),
ins_liab_debit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, adj.line_no, 'debit',
    c.code, -adj.initial_balance
  FROM new_journal nj, adjustments adj, capital c
  WHERE adj.account_type = 'liability'
  RETURNING 1 AS x
),
ins_liab_credit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, adj.line_no, 'credit',
    a.code, adj.initial_balance
  FROM new_journal nj, adjustments adj
  JOIN acct a ON a.display_code = adj.account_code
  WHERE adj.account_type = 'liability'
  RETURNING 1 AS x
)
SELECT
  (SELECT count(*) FROM ins_asset_debit) + (SELECT count(*) FROM ins_asset_credit) +
  (SELECT count(*) FROM ins_liab_debit) + (SELECT count(*) FROM ins_liab_credit) AS total_lines;
```

## Verification Query

```sql
WITH zaim_expected(account_code, zaim_balance) AS (VALUES
  -- Update with current Zaim app balances
  ('1110', 45443), ('1120', 9155), ...
)
SELECT ze.account_code, a.name, ze.zaim_balance,
  -COALESCE(SUM(jl.amount), 0) AS db_balance,
  ze.zaim_balance - (-COALESCE(SUM(jl.amount), 0)) AS diff
FROM zaim_expected ze
JOIN data_stockflow.current_account a
  ON a.display_code = ze.account_code
  AND a.tenant_id = '00000000-0000-0000-0000-000000000001'
LEFT JOIN data_stockflow.journal_line jl
  ON jl.account_code = a.code AND jl.tenant_id = a.tenant_id
GROUP BY ze.account_code, a.name, a.account_type, ze.zaim_balance
ORDER BY ze.account_code;
```

All `diff` values should be `0`.

## Notes

- Zaim API does not expose account opening balances; they must be read from the app manually.
- The `raw_zaim__account` table in `data_warehouse` only stores name/sort/active metadata.
- Some Zaim account names had trailing spaces (e.g., `AD_Electricity `, `PD_Amazon_Prime `).
  The migration script uses `TRIM()` on join conditions, but these should be fixed at source.
  A `sanitize()` / `zSanitized()` validator was added to prevent this in the application layer.
