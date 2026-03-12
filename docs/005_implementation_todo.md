# 実装 TODO

## Phase 1: DB セットアップ（スキャフォールド済み → DB 反映）

- [ ] `prisma migrate dev --name init` で Neon にテーブル作成
- [ ] CHECK 制約を migration SQL に手動追記（Prisma が生成しないもの）
  - `account.account_type IN ('asset','liability','equity','revenue','expense')`
  - `account.sign IN (1, -1)`
  - `journal_line.side IN ('debit','credit')`
  - `journal_line.amount <> 0`
  - `journal.journal_type IN ('normal','closing','prior_adj','auto')`
  - `journal.slip_category IN ('ordinary','transfer','receipt','payment')`
  - `journal.adjustment_flag IN ('none','monthly_adj','year_end_adj')`
  - `fiscal_period.status IN ('open','closed','finalized')`
  - `tax_class.direction IN ('purchase','sale')`
  - `tax_class.invoice_type IN ('qualified','transitional_80','transitional_50','none')`
  - `account_mapping.side IN ('debit','credit')`
- [ ] Constraint Trigger を migration SQL に追記
  - `check_journal_balance()`: `SUM(amount) = 0` per journal_id
  - `DEFERRABLE INITIALLY DEFERRED`
- [ ] current_* ビュー（10個）を migration SQL に追記
- [ ] `pnpm dev` → `GET /api/health` で DB 接続確認

## Phase 2: API ルート実装

- [ ] 共通ミドルウェア: tenant_id 解決、認証（created_by）
- [ ] Account CRUD（→ append-only INSERT）
- [ ] Tag CRUD
- [ ] Department CRUD
- [ ] FiscalPeriod CRUD
- [ ] Counterparty CRUD
- [ ] TenantSetting CRUD
- [ ] AccountMapping / PaymentMapping CRUD
- [ ] Journal CRUD（revision 管理、確定制御）
- [ ] TaxClass CRUD（platform 権限）

## Phase 3: データ連携

- [ ] Zaim → journal 変換パイプライン（`data_warehouse.raw_zaim__money` → マッピングルール適用 → journal INSERT）
- [ ] account_mapping / payment_mapping のシードデータ投入

## Phase 4: エクスポート

- [ ] 勘定奉行 CSV エクスポート（line_group 分解 → OBC 受入形式 Shift-JIS）

## Phase 5: UI

- [ ] 仕訳一覧・入力画面
- [ ] マスタ管理画面
- [ ] 帳票表示（試算表、元帳）
