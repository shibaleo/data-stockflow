-- =============================================================================
-- Zaim → data-stockflow migration script v1
-- カスタムカテゴリ期間用（2025-03 ～）
-- 冪等: zaim_id ベースで重複排除。何度でも安全に再実行可能。
-- =============================================================================

-- 定数
-- tenant_id : 00000000-0000-0000-0000-000000000001
-- created_by: 00000000-0000-0000-0000-000000000099

-- =============================================================================
-- Step 0: 不足する会計期間の作成
-- =============================================================================
-- 2026-01, 2026-02, 2026-03 が必要

INSERT INTO data_stockflow.fiscal_period
  (tenant_id, display_code, revision, created_by, fiscal_year, period_no, start_date, end_date, status)
SELECT
  '00000000-0000-0000-0000-000000000001',
  v.display_code, 1,
  '00000000-0000-0000-0000-000000000099',
  v.fiscal_year, v.period_no, v.start_date, v.end_date, 'open'
FROM (VALUES
  ('2026-01', 2026, 1, '2026-01-01'::date, '2026-01-31'::date),
  ('2026-02', 2026, 2, '2026-02-01'::date, '2026-02-28'::date),
  ('2026-03', 2026, 3, '2026-03-01'::date, '2026-03-31'::date)
) AS v(display_code, fiscal_year, period_no, start_date, end_date)
WHERE NOT EXISTS (
  SELECT 1 FROM data_stockflow.current_fiscal_period cfp
  WHERE cfp.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND cfp.display_code = v.display_code
);

-- =============================================================================
-- Step 1: payment レコード（2,601件 - 特殊ケース除外）
-- =============================================================================
-- debit: 費用科目 amount = -zaim.amount
-- credit: 支払元BS科目 amount = +zaim.amount
-- tags: category_label + genre_label + ZAIM

WITH bs_map(zaim_account, account_code) AS (VALUES
  ('CY_WALLET','1110'),('CY_MOBILE_SUICA','1120'),('CY_PAYPAY','1130'),('CY_PASUMO','1140'),
  ('BK_82','1210'),('BK_JRE','1220'),('CD_PRIVATE','1300'),
  ('DP_STARBUCKS','1410'),('DP_TATEISHI','1420'),('DP_FACILITY','1521'),('DP_PRIVATE','1522'),
  ('BK_MUFG','1511'),('BK_JP_POST','1512'),('BK_RAKUTEN','1513'),('BK_SMBC','1514'),
  ('CC_VIEW','2110'),('CC_RAKUTEN_MASTERCARD','2120'),('CC_RAKUTEN_JCB','2130'),
  ('CC_AMAZON','2140'),('CC_MER_CARD','2150'),('CC_YODOBASHI','2160'),
  ('PD_Amazon_Prime','1450'),('PD_CPA','1450'),('PD_Claude','1450'),('PD_Gym','1450'),
  ('PD_Kindle_Unlimited','1450'),('PD_Notion','1450'),('PD_Rent','1450'),('PD_Train','1450'),
  ('AD_Electricity','2200'),('AD_Gas','2200'),('AD_Phone','2200'),('AD_Water','2200'),
  ('LN_STUDENT','2510'),('LN_SCHOLARSHIP','2510'),('LN_TUITION_CPA','2521'),('LN_ORTHODONTIST','2522')
),
expense_map(category_name, genre_name, account_code, tag1, tag2) AS (VALUES
  ('Food','Groceries','5110','FOOD','GROCERIES'),('Food','Stable','5120','FOOD','STABLE_FOOD'),
  ('Food','Eatery','5370','FOOD','EATERY'),
  ('Items','Hygiene','5130','ITEMS','HYGIENE'),('Items','Cosme','5130','ITEMS','COSME'),
  ('Items','Kitchen','5130','ITEMS','KITCHEN'),('Items','Other','5130','ITEMS',NULL),
  ('Items','Gadgets','5130','ITEMS','GADGETS'),('Items','Toilet','5130','ITEMS','TOILET'),
  ('Items','Dining','5130','ITEMS','DINING_ITEMS'),
  ('Items','Clothes','5140','ITEMS','CLOTHES'),('Items','Shoes','5140','ITEMS','SHOES'),
  ('Transport','Gasoline','5150','TRANSPORT','GASOLINE'),
  ('Infra','Car Insurance','5210','INFRA','CAR_INSURANCE'),
  ('Infra','Fire Insurance','5220','INFRA','FIRE_INSURANCE'),
  ('Education','Tuition','5230','EDUCATION','TUITION'),
  ('Education','Books','5230','EDUCATION','EDUCATION_BOOKS'),
  ('Education','Examination','5230','EDUCATION','EXAMINATION'),
  ('Education','Other','5230','EDUCATION',NULL),
  ('Infra','Rent','5310','INFRA','RENT'),('Infra','Electricity','5320','INFRA','ELECTRICITY'),
  ('Infra','Water','5330','INFRA','WATER'),('Infra','Gas','5340','INFRA','GAS'),
  ('Infra','Phone','5350','INFRA','PHONE'),
  ('Pleasure','Eatery','5370','PLEASURE','EATERY'),
  ('Transport','Train','5380','TRANSPORT','TRAIN'),('Transport','Tolls','5380','TRANSPORT','TOLLS'),
  ('Transport','Parking','5385','TRANSPORT','PARKING'),
  ('Casual','Friends','5390','CASUAL','FRIENDS'),('Casual','Temporary','5390','CASUAL','TEMPORARY'),
  ('Pleasure','Snacks','5391','PLEASURE','SNACKS'),('Pleasure','Cafe','5391','PLEASURE','CAFE'),
  ('Pleasure','Spa','5391','PLEASURE','SPA'),('Pleasure','Other','5391','PLEASURE',NULL),
  ('Pleasure','Books','5391','PLEASURE','PLEASURE_BOOKS'),
  ('Pleasure','Cartoon','5391','PLEASURE','CARTOON'),('Pleasure','Massage','5391','PLEASURE','MASSAGE'),
  ('Pleasure','Leisure','5391','PLEASURE','LEISURE'),
  ('Learning','Books','5391','LEARNING','LEARNING_BOOKS'),
  ('Health','Hospital','5392','HEALTH','HOSPITAL'),('Health','Fee','5392','HEALTH',NULL),
  ('Health','Medicine','5392','HEALTH','MEDICINE'),('Health','Orthodontina','5392','HEALTH','ORTHODONTIA'),
  ('Health','Initial','5392','HEALTH',NULL),
  ('Work','Business Party','5393','WORK','BUSINESS_PARTY'),('Work','Coworkers','5393','WORK','COWORKERS'),
  ('Work','Clothes','5393','WORK','CLOTHES'),('Work','Shoes','5393','WORK','SHOES'),
  ('Maintenance','Laundry','5394','MAINTENANCE','LAUNDRY'),
  ('Maintenance','Car','5394','MAINTENANCE','CAR_MAINT'),
  ('Maintenance','Gabage','5394','MAINTENANCE','GARBAGE'),
  ('Close','Father','5395','CLOSE','FATHER'),('Close','Mother','5395','CLOSE','MOTHER'),
  ('Close','Sister','5395','CLOSE','SISTER'),('Close','Brother','5395','CLOSE','BROTHER'),
  ('Close','Partner','5395','CLOSE','PARTNER'),('Close','Relatives','5395','CLOSE','RELATIVES'),
  ('Close','Other','5395','CLOSE',NULL),
  ('Overhead','Console','5396','OVERHEAD','CONSOLE'),('Overhead','LLM','5396','OVERHEAD','LLM'),
  ('Overhead','logistics','5396','OVERHEAD','LOGISTICS'),('Overhead','Other','5396','OVERHEAD',NULL),
  ('Overhead','Finance','5396','OVERHEAD','FINANCE'),
  ('Health','Beauty Salon','5397','HEALTH','BEAUTY_SALON'),
  ('Obligation','Income tax','5410','OBLIGATION','INCOME_TAX'),
  ('Obligation','Residence tax','5410','OBLIGATION','RESIDENCE_TAX'),
  ('Obligation','Vehicle tax','5410','OBLIGATION','VEHICLE_TAX'),
  ('Obligation','Other','5410','OBLIGATION',NULL),
  ('Obligation','Health Insurance','5420','OBLIGATION','HEALTH_INS'),
  ('Obligation','Pension','5420','OBLIGATION','PENSION'),
  ('Obligation','Employment Insurance','5420','OBLIGATION','EMPLOYMENT_INS'),
  ('Other','Other','5510','OTHER',NULL)
),
-- 特殊ケース zaim_ids（メイン処理から除外）
special_ids AS (
  SELECT unnest(ARRAY[
    9077802313, 9192458733, 9583681629, 9636625320,  -- Inconsistent → 5510
    9051472899,                                        -- adjust initial balance → 3100振替
    9114838232                                         -- Other/Allowance → 4520（収益）
  ]::bigint[]) AS zaim_id
),
fp AS (
  SELECT code, display_code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
-- 処理対象の payment レコード
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name, z.place, z.comment,
    em.account_code AS expense_account,
    bm.account_code AS bs_account,
    em.tag1, em.tag2,
    fp.code AS fiscal_period_code
  FROM data_presentation.fct_zaim_transactions z
  JOIN expense_map em ON z.category_name = em.category_name AND TRIM(z.genre_name) = em.genre_name
  JOIN bs_map bm ON TRIM(z.from_account_name) = bm.zaim_account
  JOIN fp ON fp.display_code = to_char(z.transaction_date, 'YYYY-MM')
  WHERE z.mode = 'payment'
    AND z.amount <> 0
    AND z.zaim_id NOT IN (SELECT zaim_id FROM special_ids)
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:' || z.zaim_id
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
-- Insert journal_header
new_headers AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:' || s.zaim_id, '00000000-0000-0000-0000-000000000001', s.fiscal_period_code,
    '00000000-0000-0000-0000-000000000099'
  FROM src s
  RETURNING idempotency_code
),
-- Insert journal
new_journals AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT
    '00000000-0000-0000-0000-000000000001',
    nh.idempotency_code, 1,
    s.transaction_date::timestamptz,
    'auto', 'payment',
    CONCAT_WS(' / ', NULLIF(s.item_name,''), NULLIF(s.place,''), NULLIF(s.comment,'')),
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_headers nh
  JOIN src s ON nh.idempotency_code = 'zaim:' || s.zaim_id
  RETURNING id, idempotency_code
),
-- Debit line (expense)
ins_debit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', s.expense_account, -s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
-- Credit line (BS account)
ins_credit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', s.bs_account, s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
-- Tag: ZAIM (source)
ins_tag_zaim AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
),
-- Tag: category label
ins_tag_cat AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
  JOIN tags t ON t.display_code = s.tag1 WHERE s.tag1 IS NOT NULL
),
-- Tag: genre label
ins_tag_genre AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
  JOIN tags t ON t.display_code = s.tag2 WHERE s.tag2 IS NOT NULL
)
SELECT count(*) AS payment_count FROM new_journals;

-- =============================================================================
-- Step 2: income レコード（55件）
-- =============================================================================
-- debit: 入金先BS科目 amount = -zaim.amount
-- credit: 収益科目   amount = +zaim.amount
-- tags: ZAIM

WITH bs_map(zaim_account, account_code) AS (VALUES
  ('CY_WALLET','1110'),('CY_MOBILE_SUICA','1120'),('CY_PAYPAY','1130'),('CY_PASUMO','1140'),
  ('BK_82','1210'),('BK_JRE','1220'),('CD_PRIVATE','1300'),
  ('DP_STARBUCKS','1410'),('DP_TATEISHI','1420'),('DP_FACILITY','1521'),('DP_PRIVATE','1522'),
  ('BK_MUFG','1511'),('BK_JP_POST','1512'),('BK_RAKUTEN','1513'),('BK_SMBC','1514'),
  ('CC_VIEW','2110'),('CC_RAKUTEN_MASTERCARD','2120'),('CC_RAKUTEN_JCB','2130'),
  ('CC_AMAZON','2140'),('CC_MER_CARD','2150'),('CC_YODOBASHI','2160'),
  ('PD_Amazon_Prime','1450'),('PD_CPA','1450'),('PD_Claude','1450'),('PD_Gym','1450'),
  ('PD_Kindle_Unlimited','1450'),('PD_Notion','1450'),('PD_Rent','1450'),('PD_Train','1450'),
  ('AD_Electricity','2200'),('AD_Gas','2200'),('AD_Phone','2200'),('AD_Water','2200'),
  ('LN_STUDENT','2510'),('LN_SCHOLARSHIP','2510'),('LN_TUITION_CPA','2521'),('LN_ORTHODONTIST','2522')
),
income_map(category_name, account_code) AS (VALUES
  ('Salary','4100'),('Commuting Allowance','4120'),('Bonus','4510'),
  ('Extraordinary revenue','4520'),('Business income','4520'),('Other','4520')
),
fp AS (
  SELECT code, display_code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name, z.place, z.comment,
    im.account_code AS revenue_account,
    bm.account_code AS bs_account,
    fp.code AS fiscal_period_code
  FROM data_presentation.fct_zaim_transactions z
  JOIN income_map im ON z.category_name = im.category_name
  JOIN bs_map bm ON TRIM(z.to_account_name) = bm.zaim_account
  JOIN fp ON fp.display_code = to_char(z.transaction_date, 'YYYY-MM')
  WHERE z.mode = 'income'
    AND z.amount <> 0
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:' || z.zaim_id
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
new_headers AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:' || s.zaim_id, '00000000-0000-0000-0000-000000000001', s.fiscal_period_code,
    '00000000-0000-0000-0000-000000000099'
  FROM src s
  RETURNING idempotency_code
),
new_journals AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT
    '00000000-0000-0000-0000-000000000001',
    nh.idempotency_code, 1, s.transaction_date::timestamptz,
    'auto', 'receipt',
    CONCAT_WS(' / ', NULLIF(s.item_name,''), NULLIF(s.place,''), NULLIF(s.comment,'')),
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_headers nh JOIN src s ON nh.idempotency_code = 'zaim:' || s.zaim_id
  RETURNING id, idempotency_code
),
ins_debit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', s.bs_account, -s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_credit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', s.revenue_account, s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_tag_zaim AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
)
SELECT count(*) AS income_count FROM new_journals;

-- =============================================================================
-- Step 3: transfer レコード（212件）
-- =============================================================================
-- debit: 移動先BS科目 amount = -zaim.amount
-- credit: 移動元BS科目 amount = +zaim.amount
-- tags: ZAIM

WITH bs_map(zaim_account, account_code) AS (VALUES
  ('CY_WALLET','1110'),('CY_MOBILE_SUICA','1120'),('CY_PAYPAY','1130'),('CY_PASUMO','1140'),
  ('BK_82','1210'),('BK_JRE','1220'),('CD_PRIVATE','1300'),
  ('DP_STARBUCKS','1410'),('DP_TATEISHI','1420'),('DP_FACILITY','1521'),('DP_PRIVATE','1522'),
  ('BK_MUFG','1511'),('BK_JP_POST','1512'),('BK_RAKUTEN','1513'),('BK_SMBC','1514'),
  ('CC_VIEW','2110'),('CC_RAKUTEN_MASTERCARD','2120'),('CC_RAKUTEN_JCB','2130'),
  ('CC_AMAZON','2140'),('CC_MER_CARD','2150'),('CC_YODOBASHI','2160'),
  ('PD_Amazon_Prime','1450'),('PD_CPA','1450'),('PD_Claude','1450'),('PD_Gym','1450'),
  ('PD_Kindle_Unlimited','1450'),('PD_Notion','1450'),('PD_Rent','1450'),('PD_Train','1450'),
  ('AD_Electricity','2200'),('AD_Gas','2200'),('AD_Phone','2200'),('AD_Water','2200'),
  ('LN_STUDENT','2510'),('LN_SCHOLARSHIP','2510'),('LN_TUITION_CPA','2521'),('LN_ORTHODONTIST','2522')
),
fp AS (
  SELECT code, display_code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name, z.place, z.comment,
    bm_to.account_code AS to_account,
    bm_from.account_code AS from_account,
    fp.code AS fiscal_period_code
  FROM data_presentation.fct_zaim_transactions z
  JOIN bs_map bm_to ON TRIM(z.to_account_name) = bm_to.zaim_account
  JOIN bs_map bm_from ON TRIM(z.from_account_name) = bm_from.zaim_account
  JOIN fp ON fp.display_code = to_char(z.transaction_date, 'YYYY-MM')
  WHERE z.mode = 'transfer'
    AND z.amount <> 0
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:' || z.zaim_id
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
new_headers AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:' || s.zaim_id, '00000000-0000-0000-0000-000000000001', s.fiscal_period_code,
    '00000000-0000-0000-0000-000000000099'
  FROM src s
  RETURNING idempotency_code
),
new_journals AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT
    '00000000-0000-0000-0000-000000000001',
    nh.idempotency_code, 1, s.transaction_date::timestamptz,
    'auto', 'transfer',
    CONCAT_WS(' / ', NULLIF(s.item_name,''), NULLIF(s.place,''), NULLIF(s.comment,'')),
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_headers nh JOIN src s ON nh.idempotency_code = 'zaim:' || s.zaim_id
  RETURNING id, idempotency_code
),
ins_debit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', s.to_account, -s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_credit AS (
  INSERT INTO data_stockflow.journal_line
    (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', s.from_account, s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_tag_zaim AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
)
SELECT count(*) AS transfer_count FROM new_journals;

-- =============================================================================
-- Step 4: 特殊ケース
-- =============================================================================

-- 4a: Inconsistent 4件 → 5510 雑損
-- 通常の payment と同じ構造だが expense_account を 5510 に固定
WITH fp AS (
  SELECT code, display_code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
bs_map(zaim_account, account_code) AS (VALUES
  ('CY_MOBILE_SUICA','1120'),('CC_VIEW','2110')
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name, z.place, z.comment,
    '5510' AS expense_account,
    bm.account_code AS bs_account,
    fp.code AS fiscal_period_code
  FROM data_presentation.fct_zaim_transactions z
  JOIN bs_map bm ON TRIM(z.from_account_name) = bm.zaim_account
  JOIN fp ON fp.display_code = to_char(z.transaction_date, 'YYYY-MM')
  WHERE z.zaim_id IN (9077802313, 9192458733, 9583681629, 9636625320)
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:' || z.zaim_id
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
new_headers AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:' || s.zaim_id, '00000000-0000-0000-0000-000000000001', s.fiscal_period_code,
    '00000000-0000-0000-0000-000000000099'
  FROM src s RETURNING idempotency_code
),
new_journals AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nh.idempotency_code, 1,
    s.transaction_date::timestamptz, 'auto', 'payment',
    CONCAT_WS(' / ', NULLIF(s.item_name,''), NULLIF(s.place,''), NULLIF(s.comment,'')),
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_headers nh JOIN src s ON nh.idempotency_code = 'zaim:' || s.zaim_id
  RETURNING id, idempotency_code
),
ins_debit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', s.expense_account, -s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_credit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', s.bs_account, s.amount
  FROM new_journals nj JOIN src s ON nj.idempotency_code = 'zaim:' || s.zaim_id
),
ins_tag AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journals nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
)
SELECT count(*) AS inconsistent_count FROM new_journals;

-- 4b: adjust initial balance (zaim_id=9051472899)
-- PD_Kindle_Unlimited(1450) → 資本仮勘定(3100) への振替
-- debit: 3100 -11000 / credit: 1450 +11000
WITH fp AS (
  SELECT code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND display_code = '2025-03'
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name
  FROM data_presentation.fct_zaim_transactions z
  WHERE z.zaim_id = 9051472899
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:9051472899'
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
new_header AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:9051472899', '00000000-0000-0000-0000-000000000001', fp.code,
    '00000000-0000-0000-0000-000000000099'
  FROM src, fp
  RETURNING idempotency_code
),
new_journal AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nh.idempotency_code, 1,
    s.transaction_date::timestamptz, 'auto', 'transfer',
    'adjust initial balance / PD_Kindle_Unlimited',
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_header nh, src s
  RETURNING id, idempotency_code
),
ins_debit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', '3100', -11000
  FROM new_journal nj
),
ins_credit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', '1450', 11000
  FROM new_journal nj
),
ins_tag AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journal nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
)
SELECT count(*) AS initial_balance_count FROM new_journal;

-- 4c: Other/Allowance (zaim_id=9114838232)
-- ETC代金おまけ → 4520 雑収入（支出モードだが実質収益）
-- debit: 1110 現金 -100 / credit: 4520 雑収入 +100
WITH fp AS (
  SELECT code FROM data_stockflow.current_fiscal_period
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND display_code = '2025-08'
),
tags AS (
  SELECT code, display_code FROM data_stockflow.current_tag
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
),
src AS (
  SELECT z.zaim_id, z.transaction_date, z.amount, z.item_name
  FROM data_presentation.fct_zaim_transactions z
  WHERE z.zaim_id = 9114838232
    AND NOT EXISTS (
      SELECT 1 FROM data_stockflow.journal_header jh
      WHERE jh.idempotency_code = 'zaim:9114838232'
        AND jh.tenant_id = '00000000-0000-0000-0000-000000000001'
    )
),
new_header AS (
  INSERT INTO data_stockflow.journal_header (idempotency_code, tenant_id, fiscal_period_code, created_by)
  SELECT 'zaim:9114838232', '00000000-0000-0000-0000-000000000001', fp.code,
    '00000000-0000-0000-0000-000000000099'
  FROM src, fp
  RETURNING idempotency_code
),
new_journal AS (
  INSERT INTO data_stockflow.journal
    (tenant_id, idempotency_code, revision, posted_date, journal_type, slip_category, description, source_system, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nh.idempotency_code, 1,
    s.transaction_date::timestamptz, 'auto', 'receipt', 'ETC代金おまけ',
    'zaim', '00000000-0000-0000-0000-000000000099'
  FROM new_header nh, src s
  RETURNING id, idempotency_code
),
ins_debit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'debit', '1110', -100
  FROM new_journal nj
),
ins_credit AS (
  INSERT INTO data_stockflow.journal_line (tenant_id, journal_id, line_group, side, account_code, amount)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, 1, 'credit', '4520', 100
  FROM new_journal nj
),
ins_tag AS (
  INSERT INTO data_stockflow.journal_tag (tenant_id, journal_id, tag_code, created_by)
  SELECT '00000000-0000-0000-0000-000000000001', nj.id, t.code, '00000000-0000-0000-0000-000000000099'
  FROM new_journal nj CROSS JOIN tags t WHERE t.display_code = 'ZAIM'
)
SELECT count(*) AS allowance_count FROM new_journal;
